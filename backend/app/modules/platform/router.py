"""Directorio privado de cuentas de Vision360; independiente de los clientes de cada estudio."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.assets.models import ProcessingJob
from app.modules.auth.security import now
from app.modules.subscriptions.models import Subscription
from app.modules.subscriptions.schemas import PlanCode
from app.modules.subscriptions.service import catalog
from app.modules.organizations.service import is_staff
from app.modules.studio.router import administrator
from app.modules.workspaces.models import Workspace

router = APIRouter(tags=['platform'])


class PlatformInquiry(BaseModel):
    id: UUID
    email: str
    phone: str
    message: str
    created_at: datetime


class PlatformInbox(BaseModel):
    items: list[PlatformInquiry]
    total: int
    offset: int
    limit: int


@router.get('/admin/platform-contacts', response_model=PlatformInbox)
def platform_contacts(
    q: str = Query(default='', max_length=160),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(administrator),
):
    # Se conservan las consultas existentes, incluso si el aviso por email falló.
    # Sólo se exponen datos del formulario, nunca el payload o detalles del worker.
    contact = ProcessingJob.details['platform_contact']
    query = select(ProcessingJob).where(
        ProcessingJob.kind == 'notify_service',
        ProcessingJob.details.has_key('platform_contact'),
    )
    if term := q.strip():
        query = query.where(or_(*(contact[field].astext.icontains(term, autoescape=True)
                                 for field in ('email', 'phone', 'message'))))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    jobs = db.scalars(query.order_by(ProcessingJob.created_at.desc(), ProcessingJob.id.desc()).offset(offset).limit(limit))
    return PlatformInbox(total=total, offset=offset, limit=limit, items=[
        PlatformInquiry(id=job.id, created_at=job.created_at, **{
            field: job.details['platform_contact'][field] for field in ('email', 'phone', 'message')
        }) for job in jobs
    ])


class AccountPlan(BaseModel):
    code: PlanCode
    name: str
    status: Literal['active', 'cancelled', 'expired']


def account_plan(workspace, subscription, plans, current):
    if workspace is None:
        return None
    code = subscription.plan_code if subscription else 'legacy'
    status = 'expired' if subscription and subscription.period_end and subscription.period_end <= current else subscription.status if subscription else 'active'
    return AccountPlan(code=code, name=plans[code].name, status=status)


class RegisteredAccount(BaseModel):
    id: UUID
    display_name: str
    email: str
    phone: str | None
    account_kind: Literal['individual', 'company']
    company_name: str | None
    studio_name: str | None
    created_at: datetime
    email_verified: bool
    platform_admin: bool
    plan: AccountPlan | None


class AccountSummary(BaseModel):
    total: int
    individuals: int
    companies: int
    verified: int


class AccountDirectory(BaseModel):
    summary: AccountSummary
    filtered_total: int
    offset: int
    limit: int
    items: list[RegisteredAccount]


@router.get('/admin/accounts', response_model=AccountDirectory)
def accounts(
    q: str = Query(default='', max_length=160),
    kind: Literal['all', 'individual', 'company'] = 'all',
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(administrator),
):
    total, individuals, companies, verified = db.execute(select(
        func.count(User.id),
        func.count(User.id).filter(User.account_kind == 'individual'),
        func.count(User.id).filter(User.account_kind == 'company'),
        func.count(User.id).filter(User.email_verified_at.is_not(None)),
    )).one()
    query = select(User, Workspace, Subscription).outerjoin(Workspace, Workspace.owner_id == User.id).outerjoin(Subscription, Subscription.workspace_id == Workspace.id)
    if kind != 'all':
        query = query.where(User.account_kind == kind)
    if term := q.strip():
        # Búsqueda literal: % y _ escritos por el operador no son comodines SQL.
        query = query.where(or_(*(field.icontains(term, autoescape=True) for field in (
            User.display_name, User.email_normalized, User.phone, User.company_name, Workspace.name,
        ))))
    filtered_total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit))
    plans = catalog()
    current = now()
    return AccountDirectory(
        summary=AccountSummary(total=total, individuals=individuals, companies=companies, verified=verified),
        filtered_total=filtered_total, offset=offset, limit=limit,
        items=[RegisteredAccount(
            id=user.id, display_name=user.display_name, email=user.email_normalized,
            phone=user.phone, account_kind=user.account_kind, company_name=user.company_name,
            studio_name=workspace.name if workspace else None, created_at=user.created_at,
            plan=account_plan(workspace, subscription, plans, current),
            email_verified=user.email_verified_at is not None, platform_admin=is_staff(user),
        ) for user, workspace, subscription in rows],
    )
