from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.organizations.service import organization_access
from app.modules.properties import service
from app.modules.properties.models import Client, Property
from app.modules.properties.schemas import ClientInput, ClientResponse, OrganizationTourInput, PropertyInput, PropertyLink, PropertyResponse
from app.modules.tours.models import Tour
from app.modules.tours.schemas import TourResponse

router = APIRouter(prefix="/organizations/{organization_id}", tags=["properties"])


@router.get("/clients", response_model=list[ClientResponse])
def clients(organization_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    organization_access(db, user, organization_id)
    return list(db.scalars(select(Client).where(Client.organization_id == organization_id, Client.deleted_at.is_(None)).order_by(Client.name)))


@router.post("/clients", response_model=ClientResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_client(organization_id: UUID, data: ClientInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_record(db, user, organization_id, Client, data)


@router.put("/clients/{client_id}", response_model=ClientResponse, dependencies=[Depends(require_csrf)])
def edit_client(organization_id: UUID, client_id: UUID, data: ClientInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_record(db, user, organization_id, Client, data, client_id)


@router.delete('/clients/{client_id}', status_code=204, dependencies=[Depends(require_csrf)])
def delete_client(organization_id: UUID, client_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.delete_client(db, user, organization_id, client_id)


@router.get("/properties", response_model=list[PropertyResponse])
def properties(organization_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    organization_access(db, user, organization_id)
    return list(db.scalars(select(Property).where(Property.organization_id == organization_id).order_by(Property.created_at.desc())))


@router.post("/properties", response_model=PropertyResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_property(organization_id: UUID, data: PropertyInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_record(db, user, organization_id, Property, data)


@router.put("/properties/{property_id}", response_model=PropertyResponse, dependencies=[Depends(require_csrf)])
def edit_property(organization_id: UUID, property_id: UUID, data: PropertyInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_record(db, user, organization_id, Property, data, property_id)


@router.get("/tours", response_model=list[TourResponse])
def tours(organization_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    organization_access(db, user, organization_id)
    return list(db.scalars(select(Tour).where(Tour.organization_id == organization_id).order_by(Tour.created_at.desc())))


@router.post("/tours", response_model=TourResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_tour(organization_id: UUID, data: OrganizationTourInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.create_tour(db, user, organization_id, data)


@router.put("/tours/{tour_id}/property", response_model=TourResponse, dependencies=[Depends(require_csrf)])
def link_property(organization_id: UUID, tour_id: UUID, data: PropertyLink, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.link_property(db, user, organization_id, tour_id, data)
