"""Correo de cuenta con tokens temporales, sin persistir el contenido sensible."""
from datetime import timedelta
from html import escape
from uuid import UUID

from app.core.config import get_settings
from app.modules.auth.actions import raw_token
from app.modules.auth.models import AuthAction, User
from app.modules.auth.security import now, token_hash
from app.modules.studio.notifications import NotificationError, send


def payload(action, user):
    verification = action.purpose == 'verify'
    changing_email = action.purpose == 'change_email'
    path = 'email' if changing_email else 'verificar' if verification else 'restablecer'
    link = f"{get_settings().public_app_url.rstrip('/')}/cuenta/{path}#token={raw_token(action)}"
    title = 'Verificá tu email en Vision360' if verification else 'Restablecé tu contraseña de Vision360'
    if changing_email:
        title = 'Confirmá tu nuevo email en Vision360'
    text = f'{title}\n\nAbrí este enlace y confirmá la operación:\n{link}\n\n'
    text += 'El enlace vence en 24 horas.' if verification else 'El enlace vence en 30 minutos.'
    text += '\nSi no solicitaste esto, podés ignorar este mensaje.'
    return {'from': str(get_settings().service_notification_from), 'to': [action.target_email or user.email_normalized], 'subject': title,
            'text': text, 'html': f'<h1>{title}</h1><p><a href="{escape(link, quote=True)}">Continuar en Vision360</a></p><p>Si no solicitaste esto, ignorá este mensaje.</p>'}


def run(factory, ticket):
    from app.processing.worker import fail, locked_job
    with factory() as db:
        job = locked_job(db, ticket)
        if not job:
            return
        action = db.get(AuthAction, UUID(job.details['action_id']))
        user = db.get(User, action.user_id) if action else None
        if not action or not user or action.used_at or action.expires_at <= now() or token_hash(raw_token(action)) != action.token_hash:
            job.status = 'cancelled'; db.commit(); return
        if 'first_attempt_at' not in job.details:
            job.details = {**job.details, 'first_attempt_at': now().isoformat()}
            db.commit()
        from datetime import datetime
        if now() - datetime.fromisoformat(job.details['first_attempt_at']) >= timedelta(hours=23):
            job.status = 'failed'; job.error_code = 'email_retry_expired'; db.commit(); return
        message = payload(action, user)
    try:
        provider_id = send(message, ticket['id'])
    except NotificationError as error:
        fail(factory, ticket, error.code, retry=error.retry); return
    with factory() as db:
        job = locked_job(db, ticket)
        if job:
            job.status = 'succeeded'
            job.details = {**job.details, 'provider_id': provider_id}
            db.commit()
