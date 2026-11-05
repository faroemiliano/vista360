"""Trabajo operativo sobre una solicitud, sin copiar clientes ni recorridos existentes."""
import hashlib
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.modules.auth.security import now
from app.modules.organizations.service import organization_access, ensure_active
from app.modules.properties.models import Client, Property
from app.modules.properties.service import scoped
from app.modules.publications.models import Publication
from app.modules.studio.models import ServiceEvent, ServiceRequest
from app.modules.studio.schemas import WorkResponse
from app.modules.tours.models import Tour


def response(db, item):
    tour = db.get(Tour, item.tour_id)
    prop = db.get(Property, tour.property_id) if tour.property_id else None
    client = db.get(Client, prop.client_id) if prop and prop.client_id else None
    publication = db.get(Publication, tour.published_version_id) if tour.published_version_id else None
    return WorkResponse.model_validate({**{key: getattr(item, key) for key in WorkResponse.model_fields if hasattr(item, key)},
        'title': tour.title, 'client_id': client.id if client else None, 'client_name': client.name if client else None, 'client_deleted': bool(client and client.deleted_at),
        'property_id': prop.id if prop else None,
        'public_path': f'/tour/{tour.slug}' if tour.status == 'published' and publication and publication.status == 'active' else None,
        'has_unpublished_changes': bool(publication and publication.revision != tour.revision)})


def access(db, user, org_id, request_id, write=False):
    organization_access(db, user, org_id, write=write, lock=write)
    query = select(ServiceRequest).where(ServiceRequest.id == request_id, ServiceRequest.organization_id == org_id)
    item = db.scalar(query.with_for_update() if write else query)
    if not item:
        raise HTTPException(404, 'Trabajo no encontrado')
    return item


def attach(db, user, org_id, item, data):
    org, _ = organization_access(db, user, org_id, write=True, lock=True)
    ensure_active(org)
    if item.organization_id:
        raise HTTPException(409, 'La solicitud ya tiene un trabajo. Abrilo desde Trabajos')
    if item.status in ('FINALIZADO', 'CANCELADO'):
        raise HTTPException(409, 'Una solicitud cerrada no puede convertirse en trabajo')
    tour = scoped(db, Tour, org.id, data.tour_id) if data.tour_id else None
    prop_id = data.property_id or (tour.property_id if tour else None)
    prop = scoped(db, Property, org.id, prop_id) if prop_id else None
    client_id = data.client_id or (prop.client_id if prop else None)
    client = scoped(db, Client, org.id, client_id) if client_id else None
    if tour and (not prop or tour.property_id != prop.id):
        raise HTTPException(422, 'El recorrido debe estar asociado a la propiedad seleccionada')
    if prop and (not client or prop.client_id != client.id):
        raise HTTPException(422, 'La propiedad debe estar asociada al cliente seleccionado')
    if tour and db.scalar(select(ServiceRequest.id).where(ServiceRequest.tour_id == tour.id)):
        raise HTTPException(409, 'El recorrido ya está asociado a otro trabajo')
    if not tour and db.scalar(select(func.count()).select_from(Tour).where(Tour.organization_id == org.id)) >= org.tour_limit:
        raise HTTPException(409, 'Se alcanzó el límite de recorridos de la organización')
    if not client:
        client = Client(organization_id=org.id, name=item.name, email=item.email, phone=item.whatsapp)
        db.add(client); db.flush()
    if not prop:
        prop = Property(organization_id=org.id, client_id=client.id, title=data.title, kind=item.property_kind,
            locality=item.locality, area_m2=item.area_m2, rooms=item.rooms)
        db.add(prop); db.flush()
    if not tour:
        tour = Tour(organization_id=org.id, property_id=prop.id, owner_id=user.id,
            title=data.title, slug=f'visita-{uuid4().hex}')
        db.add(tour); db.flush()
    item.organization_id = org.id
    item.tour_id = tour.id
    item.work_revision += 1
    db.add(ServiceEvent(request_id=item.id, actor_id=user.id, previous_status=item.status,
        status=item.status, note='Trabajo preparado y vinculado a cliente, propiedad y recorrido.'))


def create(db, user, org_id, data):
    organization_access(db, user, org_id, write=True, lock=True)
    digest = hashlib.sha256((str(org_id) + data.model_dump_json(exclude={'consent', 'website'})).encode()).hexdigest()
    previous = db.scalar(select(ServiceRequest).where(ServiceRequest.submission_id == data.submission_id))
    if previous:
        if previous.organization_id != org_id or previous.fingerprint != digest:
            raise HTTPException(409, 'La referencia ya corresponde a otro trabajo')
        return response(db, previous)
    payload = data.model_dump(include={'name', 'email', 'whatsapp', 'property_kind', 'locality', 'area_m2', 'rooms', 'message'})
    # La referencia de captura manual es interna y aleatoria, independiente del formulario público.
    item = ServiceRequest(**payload, submission_id=data.submission_id, fingerprint=digest, origin='manual', status='SOLICITADO', work_revision=0)
    db.add(item)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'La referencia ya corresponde a otro trabajo') from None
    attach(db, user, org_id, item, data)
    db.commit()
    return response(db, item)


def assign(db, user, request_id, data):
    # Mismo orden de bloqueos que todas las escrituras: organización, solicitud, tour.
    organization_access(db, user, data.organization_id, write=True, lock=True)
    item = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update())
    if not item:
        raise HTTPException(404, 'Solicitud no encontrada')
    attach(db, user, data.organization_id, item, data)
    db.commit()
    return response(db, item)


def revision(item, expected):
    if item.work_revision != expected:
        raise HTTPException(409, 'El trabajo cambió. Actualizalo antes de guardar')


def save_details(db, user, org_id, request_id, data):
    item = access(db, user, org_id, request_id, write=True)
    revision(item, data.expected_revision)
    if item.status in ('CANCELADO', 'FINALIZADO'):
        raise HTTPException(409, 'El trabajo está cerrado')
    item.scheduled_at = data.scheduled_at
    item.operations_notes = data.operations_notes
    item.work_revision += 1
    db.add(ServiceEvent(request_id=item.id, actor_id=user.id, previous_status=item.status, status=item.status,
        note='Se actualizaron la visita y las notas operativas.'))
    db.commit()
    return response(db, item)


def require_publication(db, item):
    tour = db.scalar(select(Tour).where(Tour.id == item.tour_id).with_for_update())
    publication = db.get(Publication, tour.published_version_id) if tour.published_version_id else None
    if tour.status != 'published' or not publication or publication.status != 'active':
        raise HTTPException(409, 'Publicá el recorrido desde el editor antes de registrar la publicación o entrega')
    if publication.revision != tour.revision:
        raise HTTPException(409, 'Hay cambios sin publicar. Publicalos antes de registrar la entrega')
    return tour


def deliver(db, user, org_id, request_id, data):
    item = access(db, user, org_id, request_id, write=True)
    revision(item, data.expected_revision)
    if item.status != 'PUBLICADO':
        raise HTTPException(409, 'El trabajo debe estar en Publicado para registrar la entrega')
    tour = require_publication(db, item)
    item.delivered_at = now()
    item.delivered_version_id = tour.published_version_id
    item.status = 'FINALIZADO'
    item.work_revision += 1
    db.add(ServiceEvent(request_id=item.id, actor_id=user.id, previous_status='PUBLICADO', status='FINALIZADO',
        note=f'Entrega registrada por el operador: {data.note}'))
    db.commit()
    return response(db, item)
