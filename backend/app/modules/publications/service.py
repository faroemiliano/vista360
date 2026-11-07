from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.assets.models import Asset, ProcessingJob
from app.modules.auth.models import User
from app.modules.hotspots.models import Hotspot
from app.modules.publications.models import Publication, PublicationAsset
from app.modules.publications.schemas import PublicationCheck, PublicationState, PublishInput
from app.modules.tours.models import Tour
from app.modules.tours.service import ordered_scenes, owned_tour
from app.storage.factory import get_public_storage

ERRORS = {"revision_changed": "El borrador cambió durante la publicación. Revisalo y volvé a publicar.",
          "storage_error": "No se pudo completar la publicación. La versión anterior se conserva; volvé a intentar.",
          "cancelled": "Publicación cancelada."}


def check(db: Session, tour: Tour) -> PublicationCheck:
    scenes = ordered_scenes(db, tour.id)
    errors = []
    ids = {scene.id for scene in scenes}
    if not scenes:
        errors.append("Agregá al menos un ambiente")
    if tour.start_scene_id not in ids:
        errors.append("Elegí un ambiente inicial válido")
    for scene in scenes:
        asset = db.get(Asset, scene.panorama_asset_id) if scene.panorama_asset_id else None
        if not asset or asset.type != "panorama_delivery" or asset.status != "ready":
            errors.append(f"Falta una panorámica validada en {scene.name}")
        if scene.pending_panorama_asset_id:
            errors.append(f"Esperá a que termine la carga de {scene.name}")
        if asset and asset.storage_backend != get_settings().storage_backend:
            errors.append(f"El storage de {scene.name} debe migrarse antes de publicar")
    points = list(db.scalars(select(Hotspot).where(Hotspot.tour_id == tour.id)))
    graph = {scene.id: [] for scene in scenes}
    for point in points:
        if point.scene_id not in ids or (point.type == "navigation" and point.target_scene_id not in ids):
            errors.append("Hay conexiones con destinos inválidos")
        elif point.type == "navigation":
            graph[point.scene_id].append(point.target_scene_id)
    visited, pending = set(), [tour.start_scene_id] if tour.start_scene_id in ids else []
    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current); pending.extend(graph[current])
    return PublicationCheck(revision=tour.revision, errors=errors,
        unreachable_scenes=[scene.name for scene in scenes if scene.id not in visited])


def state(db: Session, tour: Tour) -> PublicationState:
    active = db.get(Publication, tour.published_version_id) if tour.published_version_id else None
    latest = db.scalar(select(Publication).where(Publication.tour_id == tour.id).order_by(Publication.version.desc()).limit(1))
    return PublicationState(status="published" if active else "unpublished", version=active.version if active else None,
        published_revision=active.revision if active else None, has_changes=bool(active and active.revision != tour.revision),
        preparing=bool(latest and latest.status == "preparing"), error_message=ERRORS.get(latest.error_code) if latest else None,
        path=f"/tour/{tour.slug}")


def prepare(db: Session, user: User, tour_id: UUID, data: PublishInput):
    tour = owned_tour(db, user, tour_id, lock=True)
    if tour.revision != data.revision:
        raise HTTPException(409, "El borrador cambió. Revisalo antes de publicar")
    if tour.published_version_id:
        active = db.get(Publication, tour.published_version_id)
        if active and active.revision == tour.revision:
            return state(db, tour)
    if db.scalar(select(Publication.id).where(Publication.tour_id == tour.id, Publication.status == "preparing").limit(1)):
        return state(db, tour)  # Publicar repetidamente no duplica tareas.
    result = check(db, tour)
    if result.errors:
        raise HTTPException(422, ". ".join(result.errors))
    if result.unreachable_scenes and not data.confirm_unreachable:
        raise HTTPException(422, "Hay ambientes sin conexión desde el inicio. Confirmá la advertencia antes de publicar")
    backend = get_settings().storage_backend
    try:
        get_public_storage(backend)
    except (ValueError, RuntimeError):
        raise HTTPException(503, "Configurá el bucket público y el dominio de medios antes de publicar") from None
    publication_id = uuid4()
    document = {"schema_version": 1, "title": tour.title, "description": tour.description,
                "public_location": tour.public_location, "start_scene_id": str(tour.start_scene_id), "scenes": []}
    asset_ids = set()
    for scene in ordered_scenes(db, tour.id):
        main = db.get(Asset, scene.panorama_asset_id)
        variants = list(db.scalars(select(Asset).where(Asset.parent_asset_id == main.parent_asset_id,
            Asset.type == "panorama_delivery", Asset.status == "ready").order_by(Asset.width.desc())))
        sources = []
        for variant in variants:
            asset_ids.add(variant.id)
            sources.append({"asset_id": str(variant.id), "key": f"publications/{publication_id}/{variant.id}.jpg",
                            "width": variant.width, "height": variant.height})
        points = db.scalars(select(Hotspot).where(Hotspot.scene_id == scene.id).order_by(Hotspot.created_at, Hotspot.id))
        document["scenes"].append({"id": str(scene.id), "name": scene.name,
            "initial_view": {"yaw": scene.initial_yaw, "pitch": scene.initial_pitch, "hfov": scene.initial_hfov},
            "sources": sources, "hotspots": [{"id": str(point.id), "type": point.type, "label": point.label,
                "yaw": point.yaw, "pitch": point.pitch, "target_scene_id": str(point.target_scene_id) if point.target_scene_id else None,
                "content": point.content} for point in points]})
    version = (db.scalar(select(func.max(Publication.version)).where(Publication.tour_id == tour.id)) or 0) + 1
    publication = Publication(id=publication_id, tour_id=tour.id, version=version, revision=tour.revision,
        status="preparing", storage_backend=backend, document=document)
    db.add(publication); db.flush()
    db.add_all([PublicationAsset(publication_id=publication.id, asset_id=asset_id, tour_id=tour.id) for asset_id in asset_ids])
    db.add(ProcessingJob(kind="publish_tour", details={"publication_id": str(publication.id), "tour_id": str(tour.id)}))
    db.commit()
    return state(db, tour)


def sources(publication: Publication):
    return [source for scene in publication.document["scenes"] for source in scene["sources"]]


def release(db: Session, publication: Publication, status: str, error_code: str | None = None):
    """Plan de claves persistido antes de copiar: incluye copias parciales tras un crash."""
    from app.modules.assets.service import cleanup_unreferenced_root
    referenced = list(db.scalars(select(Asset).join(PublicationAsset, PublicationAsset.asset_id == Asset.id)
        .where(PublicationAsset.publication_id == publication.id)))
    publication.status, publication.error_code = status, error_code
    for source in sources(publication):
        db.add(ProcessingJob(kind="delete_file", details={"backend": publication.storage_backend, "key": source["key"], "public": True}))
    db.execute(delete(PublicationAsset).where(PublicationAsset.publication_id == publication.id))
    db.flush()
    for root_id in {asset.parent_asset_id for asset in referenced if asset.parent_asset_id}:
        cleanup_unreferenced_root(db, root_id)


def unpublish(db: Session, user: User, tour_id: UUID):
    tour = owned_tour(db, user, tour_id, lock=True)
    tour.published_version_id = None; tour.status = "draft"
    db.flush()
    for publication in db.scalars(select(Publication).where(Publication.tour_id == tour.id,
            Publication.status.in_(["active", "preparing"]))):
        release(db, publication, "retired")
    db.commit()
    return state(db, tour)


def cleanup_tour(db: Session, tour: Tour):
    tour.published_version_id = None; tour.status = "draft"
    db.flush()
    for publication in db.scalars(select(Publication).where(Publication.tour_id == tour.id,
            Publication.status.in_(["active", "preparing"]))):
        release(db, publication, "retired")
    db.execute(delete(Publication).where(Publication.tour_id == tour.id))
