from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.organizations.models import Membership, Organization
from app.modules.workspaces.models import Workspace


def ensure_owned_workspace(db: Session, user: User) -> Workspace:
    # Serializa las altas concurrentes de la misma cuenta; la unicidad también
    # se exige en PostgreSQL. La transacción pertenece al llamador.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    workspace = db.scalar(select(Workspace).where(Workspace.owner_id == user.id))
    if workspace is None:
        workspace = Workspace(owner_id=user.id, name="Mi estudio")
        db.add(workspace)
        db.flush()
        from app.modules.subscriptions.models import Subscription
        from app.modules.auth.security import now
        from datetime import timedelta
        started = now()
        db.add(Subscription(workspace_id=workspace.id, plan_code='trial', period_start=started, period_end=started + timedelta(days=14)))
        db.flush()
    return workspace


def visible_workspaces(user: User):
    # Una invitación antigua a un cliente sólo da acceso a ese cliente,
    # nunca al resto de la cartera del estudio que lo administra.
    shared_client = exists(select(Organization.id).join(Membership, Membership.organization_id == Organization.id)
        .where(Organization.workspace_id == Workspace.id, Membership.user_id == user.id))
    return select(Workspace).where((Workspace.owner_id == user.id) | shared_client)


def access(db: Session, user: User, workspace_id: UUID) -> Workspace:
    workspace = db.scalar(visible_workspaces(user).where(Workspace.id == workspace_id))
    if workspace is None:
        raise HTTPException(404, "Estudio no encontrado")
    return workspace


def response(workspace: Workspace, user: User):
    return {"id": workspace.id, "name": workspace.name, "is_owner": workspace.owner_id == user.id,
            "request_token": workspace.request_token if workspace.owner_id == user.id else None}


def list_workspaces(db: Session, user: User):
    rows = db.scalars(visible_workspaces(user).order_by((Workspace.owner_id == user.id).desc(), Workspace.created_at, Workspace.id))
    return [response(row, user) for row in rows]


def rename(db: Session, user: User, workspace_id: UUID, data):
    workspace = access(db, user, workspace_id)
    if workspace.owner_id != user.id:
        raise HTTPException(403, "Sólo el titular puede cambiar el nombre del estudio")
    workspace.name = data.name
    db.commit()
    return response(workspace, user)


def owned(db: Session, user: User, workspace_id: UUID, lock=False):
    query = select(Workspace).where(Workspace.id == workspace_id, Workspace.owner_id == user.id)
    workspace = db.scalar(query.with_for_update() if lock else query)
    if workspace is None:
        raise HTTPException(404, 'Estudio no encontrado')
    return workspace


def request_page(db, user, workspace_id, enabled):
    workspace = owned(db, user, workspace_id, lock=True)
    workspace.request_token = (workspace.request_token or uuid4()) if enabled else None
    db.commit()
    return response(workspace, user)


def public_studio(db, token):
    workspace = db.scalar(select(Workspace).where(Workspace.request_token == token))
    if workspace is None:
        raise HTTPException(404, 'Este formulario no está disponible')
    return workspace
