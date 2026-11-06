import hashlib
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.modules.studio.models import ServiceEvent, ServiceRequest
from app.modules.studio.schemas import ServiceReceipt


def submit(db, data, request):
    request.app.state.service_throttle.check(request)
    payload = data.model_dump(exclude={'submission_id', 'consent', 'website'}, mode='json')
    digest = hashlib.sha256(data.model_dump_json(exclude={'submission_id', 'consent', 'website'}).encode()).hexdigest()
    previous = db.scalar(select(ServiceRequest).where(ServiceRequest.submission_id == data.submission_id))
    if previous:
        if previous.fingerprint != digest:
            raise HTTPException(409, 'La referencia corresponde a otra solicitud. Volvé a iniciar el formulario')
        return ServiceReceipt(id=previous.id)
    item = ServiceRequest(**payload, submission_id=data.submission_id, fingerprint=digest)
    db.add(item)
    try:
        db.flush()
        from app.modules.assets.models import ProcessingJob
        db.add(ProcessingJob(kind='notify_service', details={'request_id': str(item.id)}))
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = db.scalar(select(ServiceRequest).where(ServiceRequest.submission_id == data.submission_id))
        if not previous or previous.fingerprint != digest:
            raise HTTPException(409, 'La solicitud no se pudo registrar con esa referencia') from None
        return ServiceReceipt(id=previous.id)
    return ServiceReceipt(id=item.id)

def transition(db, user, request_id, data):
    previous = db.get(ServiceRequest, request_id)
    if previous and previous.organization_id:
        from app.modules.organizations.service import organization_access
        organization_access(db, user, previous.organization_id, write=True, lock=True)
    previous_org = previous.organization_id if previous else None
    item = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id).with_for_update().execution_options(populate_existing=True))
    if not item:
        raise HTTPException(404, 'Solicitud no encontrada')
    if previous_org != item.organization_id:
        raise HTTPException(409, 'La solicitud fue asignada. Actualizá la bandeja')
    if item.status != data.expected_status:
        raise HTTPException(409, 'El estado cambió. Actualizá la bandeja')
    if data.status == item.status:
        return item
    if item.organization_id:
        if data.status in ('PUBLICADO', 'FINALIZADO'):
            from app.modules.studio.work_service import require_publication
            tour = require_publication(db, item)
            if data.status == 'FINALIZADO':
                if not data.note:
                    raise HTTPException(422, 'Agregá una nota de seguimiento para registrar la entrega al finalizar')
                from app.modules.auth.security import now
                item.delivered_at = now()
                item.delivered_version_id = tour.published_version_id
    item.work_revision += 1
    db.add(ServiceEvent(request_id=item.id, actor_id=user.id, previous_status=item.status, status=data.status, note=data.note))
    item.status = data.status
    db.commit()
    return item
