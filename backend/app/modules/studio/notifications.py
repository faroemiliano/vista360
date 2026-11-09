"""Avisos internos por HTTPS. Nunca se envían correos al visitante automáticamente."""
from datetime import datetime, timedelta
from html import escape
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import select, or_, func

from app.core.config import get_settings
from app.modules.assets.models import ProcessingJob
from app.modules.auth.security import now
from app.modules.studio.models import ServiceRequest
from app.modules.studio.schemas import ServiceResponse


class NotificationError(Exception):
    def __init__(self, code, retry=False):
        self.code, self.retry = code, retry
        super().__init__(code)


def transport_configured():
    settings = get_settings()
    return bool(settings.resend_api_key and settings.resend_api_key.get_secret_value()
                and settings.service_notification_from and settings.public_app_url)


def configured(recipient=None):
    settings = get_settings()
    recipient = recipient or settings.service_notification_to
    if not transport_configured() or not recipient:
        return False
    # El remitente de prueba sólo puede avisar a la cuenta de Resend del operador.
    return (not str(settings.service_notification_from).lower().endswith('@resend.dev')
            or str(recipient).lower() == str(settings.service_notification_to).lower())


def claimable():
    settings = get_settings()
    other_jobs = ProcessingJob.kind.not_in(['notify_service', 'notify_auth'])
    if not transport_configured():
        return other_jobs
    recipient = func.coalesce(ProcessingJob.details['recipient'].astext,
                             str(settings.service_notification_to) if settings.service_notification_to else None)
    allowed = recipient.is_not(None)
    if str(settings.service_notification_from).lower().endswith('@resend.dev'):
        if not settings.service_notification_to:
            return other_jobs
        allowed = func.lower(recipient) == str(settings.service_notification_to).lower()
    return or_(other_jobs, allowed)


def responses(db, items):
    ids = [str(item.id) for item in items]
    jobs = db.scalars(select(ProcessingJob).where(ProcessingJob.kind == 'notify_service',
        ProcessingJob.details['request_id'].astext.in_(ids))) if ids else []
    statuses = {job.details['request_id']: (job.status, job.details.get('recipient')) for job in jobs}
    result = []
    for item in items:
        status, recipient = statuses.get(str(item.id), (None, None))
        ready = configured(recipient)
        label = ('accepted' if status == 'succeeded' else 'failed' if status == 'failed'
                 else ('pending' if ready else 'not_configured') if status in ('queued', 'running') else None)
        result.append(ServiceResponse.model_validate(item).model_copy(update={'notification_status': label}))
    return result


def payload(item, recipient=None):
    settings = get_settings()
    link = f"{settings.public_app_url.rstrip('/')}/studio/solicitudes?solicitud={item.id}"
    link += f'&estudio={item.workspace_id}' if item.workspace_id else '&origen=vision360'
    fields = [('Nombre', item.name), ('Email', item.email), ('WhatsApp', item.whatsapp),
              ('Tipo de propiedad', item.property_kind), ('Localidad', item.locality),
              ('Superficie', f'{item.area_m2:g} m²'), ('Ambientes', str(item.rooms)), ('Mensaje', item.message or 'Sin mensaje')]
    text = 'Nueva consulta de fotografía 360°\n\n' + '\n'.join(f'{key}: {value}' for key, value in fields)
    text += f'\n\nVer solicitud: {link}\nReferencia: {item.id}'
    rows = ''.join(f'<tr><th align="left" style="padding:8px;vertical-align:top">{escape(key)}</th>'
                   f'<td style="padding:8px;white-space:pre-wrap">{escape(value)}</td></tr>' for key, value in fields)
    html = (f'<h1>Nueva consulta de fotografía 360°</h1><table>{rows}</table>'
            f'<p><a href="{escape(link, quote=True)}" style="display:inline-block;padding:14px 20px;'
            'background:#102032;color:#b0f4ff;text-decoration:none;border-radius:8px">Ver solicitud</a></p>'
            f'<p>Referencia: {item.id}</p>')
    return {'from': str(settings.service_notification_from), 'to': [str(recipient or settings.service_notification_to)],
            'reply_to': item.email, 'subject': 'Vision360 · Nueva consulta de fotografía', 'text': text, 'html': html}


def send(payload_data, job_id):
    request = Request('https://api.resend.com/emails', method='POST',
        data=json.dumps(payload_data, ensure_ascii=False).encode(), headers={
            'Authorization': f'Bearer {get_settings().resend_api_key.get_secret_value()}',
            'Content-Type': 'application/json', 'User-Agent': 'Vision360/1.0',
            'Idempotency-Key': f'service-notification/{job_id}',
        })
    try:
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read(65536))
            if not isinstance(result, dict) or not isinstance(result.get('id'), str) or not result['id']:
                raise NotificationError('email_invalid_response', retry=True)
            return result['id']
    except HTTPError as error:
        raise NotificationError(f'email_http_{error.code}', retry=error.code in (408, 409, 429) or error.code >= 500) from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise NotificationError('email_unavailable', retry=True) from None


def run(factory, ticket):
    # Importación diferida: el worker también importa este módulo para filtrar la cola.
    from app.processing.worker import fail, locked_job
    with factory() as db:
        job = locked_job(db, ticket)
        if not job:
            return
        details = dict(job.details)
        if 'platform_contact' not in details:
            item = db.get(ServiceRequest, UUID(details['request_id']))
            if not item:
                job.status = 'cancelled'; db.commit(); return
        if 'payload' not in details:
            if 'platform_contact' in details:
                from app.modules.studio.contact import payload as contact_payload
                message = contact_payload(details['platform_contact'])
            else:
                message = payload(item, details.get('recipient'))
            details.update(payload=message, first_attempt_at=now().isoformat())
            job.details = details
            db.commit()
        message = details['payload']
        first_attempt = datetime.fromisoformat(details['first_attempt_at'])
    # Resend conserva la clave por 24 h. No reenviar automáticamente fuera de esa ventana.
    if now() - first_attempt >= timedelta(hours=23):
        fail(factory, ticket, 'email_retry_expired'); return
    try:
        provider_id = send(message, ticket['id'])
    except NotificationError as error:
        fail(factory, ticket, error.code, retry=error.retry); return
    with factory() as db:
        job = locked_job(db, ticket)
        if job:
            job.status = 'succeeded'
            job.error_code = None
            job.details = {**job.details, 'provider_id': provider_id}
            db.commit()
