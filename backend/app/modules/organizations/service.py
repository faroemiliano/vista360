from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.auth.security import now
from app.modules.organizations.models import Membership, Organization
from app.modules.organizations.schemas import MemberInput, OrganizationInput, OrganizationResponse, OrganizationDetails


def is_staff(user: User):
    return user.id in get_settings().platform_admin_user_ids


def organization_access(db: Session, user: User, organization_id: UUID, write=False, manage=False, lock=False):
    org = db.scalar(select(Organization).where(Organization.id == organization_id).with_for_update()) if lock else db.get(Organization, organization_id)
    membership = db.get(Membership, (organization_id, user.id)) if org else None
    if not membership:
        raise HTTPException(404, "Organización no encontrada")
    if (write and membership.role == "viewer") or (manage and membership.role not in ("owner", "admin")):
        raise HTTPException(403, "Tu rol no permite realizar esta operación")
    return org, membership


def response(org, role):
    details = {field: getattr(org, field) for field in OrganizationDetails.model_fields}
    return OrganizationResponse(id=org.id, workspace_id=org.workspace_id, **details, kind=org.kind, role=role,
        tour_limit=org.tour_limit, member_limit=org.member_limit, storage_quota_bytes=org.storage_quota_bytes, deleted_at=org.deleted_at)


def list_organizations(db: Session, user: User, include_deleted=False, workspace_id=None):
    query = select(Organization, Membership).join(Membership, Membership.organization_id == Organization.id).where(Membership.user_id == user.id)
    if workspace_id is not None:
        from app.modules.workspaces.service import access
        access(db, user, workspace_id)
        query = query.where(Organization.workspace_id == workspace_id)
    if not include_deleted:
        query = query.where(Organization.deleted_at.is_(None))
    return [response(org, member.role) for org, member in db.execute(query.order_by(Organization.created_at))]


def ensure_active(org):
    if org.deleted_at:
        raise HTTPException(409, 'La organización fue eliminada. Sus trabajos se conservan, pero no admite registros nuevos')


def delete_organization(db: Session, user: User, organization_id: UUID):
    org, member = organization_access(db, user, organization_id, manage=True, lock=True)
    if member.role != 'owner':
        raise HTTPException(403, 'Sólo un propietario puede eliminar la organización')
    if org.deleted_at:
        raise HTTPException(404, 'Organización eliminada')
    org.deleted_at = now()
    db.commit()


def update(db: Session, user: User, organization_id: UUID, data: OrganizationDetails):
    org, member = organization_access(db, user, organization_id, manage=True, lock=True)
    ensure_active(org)
    for field, value in data.model_dump().items():
        setattr(org, field, str(value) if field == 'email' and value is not None else value)
    db.commit()
    return response(org, member.role)


def create(db: Session, user: User, data: OrganizationInput):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    from app.modules.workspaces.service import access, ensure_owned_workspace
    workspace = access(db, user, data.workspace_id) if data.workspace_id else ensure_owned_workspace(db, user)
    if workspace.owner_id != user.id:
        raise HTTPException(403, "Sólo el titular del estudio puede registrar clientes nuevos")
    if data.kind == "studio" and not is_staff(user):
        raise HTTPException(403, "Sólo administración puede crear un Studio propio")
    if db.scalar(select(func.count()).select_from(Membership).join(Organization, Organization.id == Membership.organization_id).where(Membership.user_id == user.id, Membership.role == "owner", Organization.deleted_at.is_(None))) >= 10:
        raise HTTPException(409, "Límite de diez organizaciones propias")
    settings = get_settings()
    org = Organization(**data.model_dump(exclude={"workspace_id"}), workspace_id=workspace.id, tour_limit=settings.organization_tour_limit,
        member_limit=settings.organization_member_limit, storage_quota_bytes=settings.organization_storage_quota_bytes)
    db.add(org); db.flush()
    db.add(Membership(organization_id=org.id, user_id=user.id, role="owner")); db.commit()
    return response(org, "owner")


def members(db: Session, user: User, organization_id: UUID):
    organization_access(db, user, organization_id, manage=True)
    return [{"user_id": account.id, "email": account.email_normalized, "role": member.role}
        for member, account in db.execute(select(Membership, User).join(User, User.id == Membership.user_id)
            .where(Membership.organization_id == organization_id).order_by(User.email_normalized))]


def set_member(db: Session, user: User, organization_id: UUID, data: MemberInput):
    org, actor = organization_access(db, user, organization_id, manage=True, lock=True)
    target = db.scalar(select(User).where(User.email_normalized == str(data.email).casefold()))
    if not target:
        raise HTTPException(422, "La persona debe crear su cuenta antes de incorporarse al equipo")
    membership = db.get(Membership, (org.id, target.id))
    if actor.role != "owner" and (data.role == "owner" or (membership and membership.role == "owner")):
        raise HTTPException(403, "Sólo un propietario puede administrar propietarios")
    if membership and membership.role == "owner" and data.role != "owner":
        ensure_other_owner(db, org.id, target.id)
    if not membership:
        count = db.scalar(select(func.count()).select_from(Membership).where(Membership.organization_id == org.id))
        if count >= org.member_limit:
            raise HTTPException(409, "Se alcanzó el límite de colaboradores")
        membership = Membership(organization_id=org.id, user_id=target.id)
        db.add(membership)
    membership.role = data.role; db.commit()
    return {"user_id": target.id, "email": target.email_normalized, "role": membership.role}


def ensure_other_owner(db, org_id, user_id):
    if not db.scalar(select(Membership.user_id).where(Membership.organization_id == org_id,
            Membership.role == "owner", Membership.user_id != user_id).limit(1)):
        raise HTTPException(409, "La organización debe conservar al menos un propietario")


def remove_member(db, user, org_id, user_id):
    org, actor = organization_access(db, user, org_id, manage=True, lock=True)
    member = db.get(Membership, (org.id, user_id))
    if not member:
        raise HTTPException(404, "Colaborador no encontrado")
    if member.role == "owner":
        if actor.role != "owner":
            raise HTTPException(403, "Sólo un propietario puede quitar otro propietario")
        ensure_other_owner(db, org.id, user_id)
    db.delete(member); db.commit()


def set_limits(db, user, org_id, data):
    if not is_staff(user):
        raise HTTPException(403, "Sólo administración de Vision360 puede cambiar límites")
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    if not org: raise HTTPException(404, "Organización no encontrada")
    from app.modules.tours.models import Tour
    from app.modules.assets.models import Asset
    from app.modules.assets.service import DELIVERY_RESERVATION
    count_tours = db.scalar(select(func.count()).select_from(Tour).where(Tour.organization_id == org.id))
    count_members = db.scalar(select(func.count()).select_from(Membership).where(Membership.organization_id == org.id))
    originals = db.scalars(select(Asset).join(Tour, Tour.id == Asset.tour_id).where(Tour.organization_id == org.id,
        Asset.type == "panorama_original", Asset.status != "rejected"))
    reserved = sum(asset.size_bytes + DELIVERY_RESERVATION for asset in originals)
    if count_tours > data.tour_limit or count_members > data.member_limit or reserved > data.storage_quota_bytes:
        raise HTTPException(409, "Los límites no pueden quedar por debajo del uso o las reservas actuales")
    for key, value in data.model_dump().items(): setattr(org, key, value)
    db.commit()
    return data
