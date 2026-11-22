"""Bytes de archivos finalizados asociados a proyectos; no incluye reservas."""
from sqlalchemy import BigInteger, case, func, literal, select, union_all

from app.modules.assets.models import Asset
from app.modules.organizations.models import Organization
from app.modules.publications.models import Publication, PublicationAsset
from app.modules.studio.models import ServiceRequest
from app.modules.tours.models import Tour
from app.modules.workspaces.models import Workspace

COMPONENTS = ('original_bytes', 'derived_bytes', 'public_bytes', 'pdf_bytes')


def tour_storage():
    zero = literal(0, type_=BigInteger)
    private = select(
        Asset.tour_id,
        case((Asset.type == 'panorama_original', Asset.size_bytes), else_=zero).label('original_bytes'),
        case((Asset.type == 'panorama_delivery', Asset.size_bytes), else_=zero).label('derived_bytes'),
        zero.label('public_bytes'), zero.label('pdf_bytes'),
    ).where(Asset.status == 'ready')
    public = select(PublicationAsset.tour_id, zero, zero, Asset.size_bytes, zero).select_from(PublicationAsset).join(
        Publication, Publication.id == PublicationAsset.publication_id).join(
        Asset, Asset.id == PublicationAsset.asset_id).where(Publication.status == 'active')
    pdfs = select(ServiceRequest.tour_id, zero, zero, zero,
                  ServiceRequest.delivery_file['size_bytes'].as_integer()).where(
        ServiceRequest.delivery_file.is_not(None), ServiceRequest.tour_id.is_not(None))
    files = union_all(private, public, pdfs).subquery()
    return select(files.c.tour_id, *(
        func.coalesce(func.sum(files.c[name]), 0).label(name) for name in COMPONENTS
    )).group_by(files.c.tour_id).subquery()


def workspace_storage():
    sizes = tour_storage()
    # Los proyectos de un cliente pertenecen a su estudio, incluso si un editor
    # creó el recorrido. Los personales se asignan al estudio de su titular.
    return select(Workspace.id.label('workspace_id'), *(
        func.coalesce(func.sum(sizes.c[name]), 0).label(name) for name in COMPONENTS
    )).select_from(Tour).outerjoin(Organization, Organization.id == Tour.organization_id).join(
        Workspace, (Workspace.id == Organization.workspace_id) |
        (Tour.organization_id.is_(None) & (Workspace.owner_id == Tour.owner_id)),
    ).outerjoin(sizes, sizes.c.tour_id == Tour.id).group_by(Workspace.id).subquery()


def totals(db, workspace):
    sizes = workspace_storage()
    row = db.execute(select(*(sizes.c[name] for name in COMPONENTS)).where(
        sizes.c.workspace_id == workspace.id)).mappings().one_or_none()
    result = {name: int(row[name]) if row else 0 for name in COMPONENTS}
    return {**result, 'used_bytes': sum(result.values())}


def report(db, workspace, offset, limit):
    from app.modules.subscriptions.service import tours_for
    sizes = tour_storage()
    query = select(Tour.id.label('tour_id'), Tour.title, *(
        func.coalesce(sizes.c[name], 0).label(name) for name in COMPONENTS
    )).outerjoin(sizes, sizes.c.tour_id == Tour.id).where(Tour.id.in_(tours_for(workspace)))
    count = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(Tour.created_at.desc(), Tour.id.desc()).offset(offset).limit(limit)).mappings()
    projects = []
    for row in rows:
        data = dict(row)
        data['used_bytes'] = sum(int(row[name]) for name in COMPONENTS)
        projects.append(data)
    return dict(totals=totals(db, workspace), projects=projects, total=count, offset=offset, limit=limit)
