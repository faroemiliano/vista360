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
from app.modules.organizations.service import is_staff
from app.modules.studio.router import administrator
from app.modules.workspaces.models import Workspace

router = APIRouter(tags=['platform'])


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
    query = select(User, Workspace.name).outerjoin(Workspace, Workspace.owner_id == User.id)
    if kind != 'all':
        query = query.where(User.account_kind == kind)
    if term := q.strip():
        # Búsqueda literal: % y _ escritos por el operador no son comodines SQL.
        query = query.where(or_(*(field.icontains(term, autoescape=True) for field in (
            User.display_name, User.email_normalized, User.phone, User.company_name, Workspace.name,
        ))))
    filtered_total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit))
    return AccountDirectory(
        summary=AccountSummary(total=total, individuals=individuals, companies=companies, verified=verified),
        filtered_total=filtered_total, offset=offset, limit=limit,
        items=[RegisteredAccount(
            id=user.id, display_name=user.display_name, email=user.email_normalized,
            phone=user.phone, account_kind=user.account_kind, company_name=user.company_name,
            studio_name=studio_name, created_at=user.created_at,
            email_verified=user.email_verified_at is not None, platform_admin=is_staff(user),
        ) for user, studio_name in rows],
    )
