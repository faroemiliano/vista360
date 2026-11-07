from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.organizations.service import is_staff
from app.modules.studio import service, work_service, notifications
from app.modules.organizations.service import organization_access
from app.modules.studio.models import ServiceEvent, ServiceRequest
from app.modules.studio.schemas import (AssignWorkInput, DeliveryInput, EventResponse, ServiceInput,
    ServiceReceipt, ServiceResponse, TransitionInput, WorkCreate, WorkDetails, WorkResponse, Status)

router = APIRouter(tags=["studio"])


def administrator(user: User = Depends(current_user)):
    if not is_staff(user):
        raise HTTPException(403, "Acceso reservado a administración de Vision360")
    return user


def web_request(db, request_id, workspace_id=None):
    item = db.scalar(select(ServiceRequest).where(ServiceRequest.id == request_id,
        ServiceRequest.origin == 'web', ServiceRequest.workspace_id == workspace_id))
    if not item:
        raise HTTPException(404, 'Solicitud no encontrada')
    return item


@router.post("/service-requests", response_model=ServiceReceipt, status_code=201, dependencies=[Depends(require_csrf)])
def submit(data: ServiceInput, request: Request, db: Session = Depends(get_db)):
    return service.submit(db, data, request)


@router.get("/admin/service-requests", response_model=list[ServiceResponse])
def list_requests(limit: int = 50, offset: int = 0, db: Session = Depends(get_db), user: User = Depends(administrator)):
    if not 1 <= limit <= 100 or offset < 0: raise HTTPException(422, "Paginación inválida")
    items = list(db.scalars(select(ServiceRequest).where(ServiceRequest.origin == 'web', ServiceRequest.workspace_id.is_(None)).order_by(ServiceRequest.created_at.desc()).limit(limit).offset(offset)))
    return notifications.responses(db, items)


@router.get('/admin/service-requests/{request_id}', response_model=ServiceResponse)
def request_details(request_id: UUID, db: Session = Depends(get_db), user: User = Depends(administrator)):
    item = web_request(db, request_id)
    return notifications.responses(db, [item])[0]


@router.put("/admin/service-requests/{request_id}/status", response_model=ServiceResponse, dependencies=[Depends(require_csrf)])
def transition(request_id: UUID, data: TransitionInput, db: Session = Depends(get_db), user: User = Depends(administrator)):
    web_request(db, request_id)
    return service.transition(db, user, request_id, data)


@router.get("/admin/service-requests/{request_id}/events", response_model=list[EventResponse])
def events(request_id: UUID, db: Session = Depends(get_db), user: User = Depends(administrator)):
    item = web_request(db, request_id)
    if item.organization_id: organization_access(db, user, item.organization_id)
    return list(db.scalars(select(ServiceEvent).where(ServiceEvent.request_id == request_id).order_by(ServiceEvent.created_at)))


@router.post('/admin/service-requests/{request_id}/work', response_model=WorkResponse, dependencies=[Depends(require_csrf)])
def assign_work(request_id: UUID, data: AssignWorkInput, db: Session = Depends(get_db), user: User = Depends(administrator)):
    web_request(db, request_id)
    return work_service.assign(db, user, request_id, data)


@router.get('/organizations/{organization_id}/jobs', response_model=list[WorkResponse])
def jobs(organization_id: UUID, offset: int = 0, status: Status | None = None,
         db: Session = Depends(get_db), user: User = Depends(current_user)):
    organization_access(db, user, organization_id)
    if offset < 0: raise HTTPException(422, 'Paginación inválida')
    query = select(ServiceRequest).where(ServiceRequest.organization_id == organization_id)
    if status: query = query.where(ServiceRequest.status == status)
    return [work_service.response(db, item) for item in db.scalars(query.order_by(ServiceRequest.created_at.desc()).offset(offset).limit(50))]


@router.post('/organizations/{organization_id}/jobs', response_model=WorkResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_job(organization_id: UUID, data: WorkCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return work_service.create(db, user, organization_id, data)


@router.get('/organizations/{organization_id}/jobs/{request_id}', response_model=WorkResponse)
def get_job(organization_id: UUID, request_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return work_service.response(db, work_service.access(db, user, organization_id, request_id))


@router.put('/organizations/{organization_id}/jobs/{request_id}', response_model=WorkResponse, dependencies=[Depends(require_csrf)])
def edit_job(organization_id: UUID, request_id: UUID, data: WorkDetails, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return work_service.save_details(db, user, organization_id, request_id, data)


@router.put('/organizations/{organization_id}/jobs/{request_id}/status', response_model=WorkResponse, dependencies=[Depends(require_csrf)])
def job_status(organization_id: UUID, request_id: UUID, data: TransitionInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    work_service.access(db, user, organization_id, request_id, write=True)
    return work_service.response(db, service.transition(db, user, request_id, data))


@router.get('/organizations/{organization_id}/jobs/{request_id}/events', response_model=list[EventResponse])
def job_events(organization_id: UUID, request_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    work_service.access(db, user, organization_id, request_id)
    return list(db.scalars(select(ServiceEvent).where(ServiceEvent.request_id == request_id).order_by(ServiceEvent.created_at, ServiceEvent.id)))


@router.post('/organizations/{organization_id}/jobs/{request_id}/delivery', response_model=WorkResponse, dependencies=[Depends(require_csrf)])
def delivery(organization_id: UUID, request_id: UUID, data: DeliveryInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return work_service.deliver(db, user, organization_id, request_id, data)


@router.post('/public/studios/{token}/service-requests', response_model=ServiceReceipt, status_code=201, dependencies=[Depends(require_csrf)])
def submit_to_studio(token: UUID, data: ServiceInput, request: Request, db: Session = Depends(get_db)):
    from app.modules.workspaces.service import public_studio
    return service.submit(db, data, request, workspace=public_studio(db, token))


@router.get('/workspaces/{workspace_id}/service-requests', response_model=list[ServiceResponse])
def studio_requests(workspace_id: UUID, offset: int = 0, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.workspaces.service import owned
    owned(db, user, workspace_id)
    if not 1 <= limit <= 100 or offset < 0:
        raise HTTPException(422, 'Paginación inválida')
    items = list(db.scalars(select(ServiceRequest).where(ServiceRequest.origin == 'web',
        ServiceRequest.workspace_id == workspace_id).order_by(ServiceRequest.created_at.desc()).offset(offset).limit(limit)))
    return notifications.responses(db, items)


@router.get('/workspaces/{workspace_id}/service-requests/{request_id}', response_model=ServiceResponse)
def studio_request(workspace_id: UUID, request_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.workspaces.service import owned
    owned(db, user, workspace_id)
    return notifications.responses(db, [web_request(db, request_id, workspace_id)])[0]


@router.put('/workspaces/{workspace_id}/service-requests/{request_id}/status', response_model=ServiceResponse, dependencies=[Depends(require_csrf)])
def studio_transition(workspace_id: UUID, request_id: UUID, data: TransitionInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.workspaces.service import owned
    owned(db, user, workspace_id)
    web_request(db, request_id, workspace_id)
    return service.transition(db, user, request_id, data)


@router.get('/workspaces/{workspace_id}/service-requests/{request_id}/events', response_model=list[EventResponse])
def studio_events(workspace_id: UUID, request_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.workspaces.service import owned
    owned(db, user, workspace_id)
    item = web_request(db, request_id, workspace_id)
    if item.organization_id:
        organization_access(db, user, item.organization_id)
    return list(db.scalars(select(ServiceEvent).where(ServiceEvent.request_id == request_id).order_by(ServiceEvent.created_at)))


@router.post('/workspaces/{workspace_id}/service-requests/{request_id}/work', response_model=WorkResponse, dependencies=[Depends(require_csrf)])
def studio_assign(workspace_id: UUID, request_id: UUID, data: AssignWorkInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.workspaces.service import owned
    owned(db, user, workspace_id)
    web_request(db, request_id, workspace_id)
    return work_service.assign(db, user, request_id, data)
