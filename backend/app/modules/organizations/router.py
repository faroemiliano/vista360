from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.organizations import service
from app.modules.organizations.schemas import AccessResponse, MemberInput, MemberResponse, OrganizationInput, OrganizationResponse, OrganizationLimits, OrganizationDetails

router = APIRouter(tags=["organizations"])


@router.get("/business/access", response_model=AccessResponse)
def access(user: User = Depends(current_user)):
    return {"platform_admin": service.is_staff(user)}


@router.get("/organizations", response_model=list[OrganizationResponse])
def list_organizations(include_deleted: bool = False, workspace_id: UUID | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.list_organizations(db, user, include_deleted, workspace_id)


@router.post("/organizations", response_model=OrganizationResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create(data: OrganizationInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.create(db, user, data)


@router.delete('/organizations/{organization_id}', status_code=204, dependencies=[Depends(require_csrf)])
def delete_organization(organization_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.delete_organization(db, user, organization_id)


@router.put('/organizations/{organization_id}', response_model=OrganizationResponse, dependencies=[Depends(require_csrf)])
def update(organization_id: UUID, data: OrganizationDetails, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.update(db, user, organization_id, data)


@router.get("/organizations/{organization_id}/members", response_model=list[MemberResponse])
def members(organization_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.members(db, user, organization_id)


@router.put("/organizations/{organization_id}/members", response_model=MemberResponse, dependencies=[Depends(require_csrf)])
def set_member(organization_id: UUID, data: MemberInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.set_member(db, user, organization_id, data)


@router.delete("/organizations/{organization_id}/members/{user_id}", status_code=204, dependencies=[Depends(require_csrf)])
def remove_member(organization_id: UUID, user_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.remove_member(db, user, organization_id, user_id)


@router.put("/admin/organizations/{organization_id}/limits", response_model=OrganizationLimits, dependencies=[Depends(require_csrf)])
def set_limits(organization_id: UUID, data: OrganizationLimits, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.set_limits(db, user, organization_id, data)
