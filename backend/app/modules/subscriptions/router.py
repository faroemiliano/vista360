from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.studio.router import administrator
from app.modules.workspaces.service import owned
from app.modules.subscriptions import service
from app.modules.subscriptions.models import SubscriptionEvent
from app.modules.subscriptions.schemas import Assignment, Cancellation, EventView, SubscriptionView

router = APIRouter(tags=['subscriptions'])


@router.get('/workspaces/{workspace_id}/subscription', response_model=SubscriptionView)
def own_plan(workspace_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.view(db, owned(db, user, workspace_id))


@router.get('/admin/accounts/{user_id}/subscription', response_model=SubscriptionView)
def account_plan(user_id: UUID, db: Session = Depends(get_db), actor: User = Depends(administrator)):
    return service.view(db, service.owner_workspace(db, user_id))


@router.put('/admin/accounts/{user_id}/subscription', response_model=SubscriptionView, dependencies=[Depends(require_csrf)])
def assign_plan(user_id: UUID, data: Assignment, db: Session = Depends(get_db), actor: User = Depends(administrator)):
    return service.change(db, actor, service.owner_workspace(db, user_id), data)


@router.post('/admin/accounts/{user_id}/subscription/cancel', response_model=SubscriptionView, dependencies=[Depends(require_csrf)])
def cancel_plan(user_id: UUID, data: Cancellation, db: Session = Depends(get_db), actor: User = Depends(administrator)):
    return service.change(db, actor, service.owner_workspace(db, user_id), data, cancel=True)


@router.get('/admin/accounts/{user_id}/subscription/events', response_model=list[EventView])
def events(user_id: UUID, db: Session = Depends(get_db), actor: User = Depends(administrator)):
    workspace = service.owner_workspace(db, user_id)
    return list(db.scalars(select(SubscriptionEvent).where(SubscriptionEvent.workspace_id == workspace.id)
        .order_by(SubscriptionEvent.created_at.desc(), SubscriptionEvent.id.desc()).limit(50)))
