from fastapi import HTTPException
from sqlalchemy import func, select
from app.modules.organizations.service import organization_access, ensure_active
from app.modules.auth.security import now
from app.modules.properties.models import Client, Property
from app.modules.tours.models import Tour
from app.modules.tours.schemas import TourInput
from app.modules.tours.service import owned_tour, save_tour, touch


def scoped(db, model, org_id, object_id):
    query = select(model).where(model.id == object_id, model.organization_id == org_id)
    if model is Client:
        query = query.where(Client.deleted_at.is_(None))
    item = db.scalar(query)
    if not item:
        raise HTTPException(404, 'Recurso no encontrado en esta organización')
    return item


def delete_client(db, user, org_id, client_id):
    organization_access(db, user, org_id, write=True, lock=True)
    client = scoped(db, Client, org_id, client_id)
    client.deleted_at = now()
    db.commit()


def save_record(db, user, org_id, model, data, record_id=None):
    org, _ = organization_access(db, user, org_id, write=True, lock=True)
    if not record_id:
        ensure_active(org)
    item = scoped(db, model, org_id, record_id) if record_id else model(organization_id=org_id)
    if model is Property and data.client_id and (not record_id or item.client_id != data.client_id):
        scoped(db, Client, org_id, data.client_id)
    if model is Property and record_id and item.client_id != data.client_id:
        from app.modules.studio.models import ServiceRequest
        if db.scalar(select(ServiceRequest.id).join(Tour, Tour.id == ServiceRequest.tour_id).where(Tour.property_id == item.id)):
            raise HTTPException(409, 'La propiedad pertenece a un trabajo. Se conserva su cliente asociado')
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    db.add(item)
    db.commit()
    return item

def create_tour(db, user, organization_id, data):
    org, _ = organization_access(db, user, organization_id, write=True, lock=True)
    ensure_active(org)
    if db.scalar(select(func.count()).select_from(Tour).where(Tour.organization_id == org.id)) >= org.tour_limit:
        raise HTTPException(409, 'Se alcanzó el límite de recorridos de la organización')
    if data.property_id:
        scoped(db, Property, org.id, data.property_id)
    return save_tour(db, user, TourInput(**data.model_dump(exclude={'property_id'})), organization_id=org.id, property_id=data.property_id)

def link_property(db, user, organization_id, tour_id, data):
    organization_access(db, user, organization_id, write=True, lock=True)
    tour = owned_tour(db, user, tour_id, lock=True)
    if tour.organization_id != organization_id:
        raise HTTPException(404, 'Recorrido no encontrado')
    from app.modules.studio.models import ServiceRequest
    if tour.property_id != data.property_id and db.scalar(select(ServiceRequest.id).where(ServiceRequest.tour_id == tour.id)):
        raise HTTPException(409, 'El recorrido pertenece a un trabajo. Se conserva su propiedad asociada')
    if data.property_id:
        scoped(db, Property, organization_id, data.property_id)
    tour.property_id = data.property_id
    touch(tour)
    db.commit()
    return tour
