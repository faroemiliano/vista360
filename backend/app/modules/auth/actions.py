"""Enlaces de un solo uso; se guardan hashes, nunca los tokens ni sus URLs."""
from datetime import timedelta
import hashlib
import hmac
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select, update

from app.core.config import get_settings
from app.modules.assets.models import ProcessingJob
from app.modules.auth.models import AuthAction, AuthSession, User
from app.modules.auth.security import now, token_hash

GENERIC_EMAIL = 'Si la cuenta corresponde, recibirás un enlace por email. Revisá también la carpeta de spam.'


def raw_token(action):
    # La parte secreta se reconstruye sólo en el servidor para enviar el correo.
    # El hash de la base por sí solo no permite obtener el enlace.
    secret = hmac.new(get_settings().csrf_secret.get_secret_value().encode(),
                      f'account-action:v1:{action.id}:{action.user_id}:{action.purpose}'.encode(), hashlib.sha256).hexdigest()
    return f'{action.id}.{secret}'


def issue(db, user, purpose, target_email=None):
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    recent = db.scalar(select(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == purpose, AuthAction.target_email == target_email,
        AuthAction.used_at.is_(None), AuthAction.expires_at > now(), AuthAction.created_at > now() - timedelta(seconds=60)).limit(1))
    if recent:
        return
    action = AuthAction(id=uuid4(), user_id=user.id, purpose=purpose, target_email=target_email,
                        expires_at=now() + timedelta(minutes=30 if purpose == 'reset' else 1440))
    action.token_hash = token_hash(raw_token(action))
    db.add(action); db.flush()
    db.add(ProcessingJob(kind='notify_auth', details={'action_id': str(action.id), 'recipient': target_email or user.email_normalized}))


def consume(db, token, purpose):
    invalid = HTTPException(400, 'El enlace es inválido, venció o ya fue utilizado. Solicitá uno nuevo.')
    try:
        action_id = UUID(token.split('.', 1)[0])
    except (ValueError, AttributeError):
        raise invalid from None
    initial = db.get(AuthAction, action_id)
    if not initial:
        raise invalid
    # Orden único de bloqueo para resolver consumos/cambios de contraseña concurrentes.
    user = db.scalar(select(User).where(User.id == initial.user_id).with_for_update().execution_options(populate_existing=True))
    action = db.scalar(select(AuthAction).where(AuthAction.id == action_id).with_for_update().execution_options(populate_existing=True))
    if (not user or not action or action.purpose != purpose or action.used_at is not None
        or action.expires_at <= now() or not hmac.compare_digest(action.token_hash, token_hash(token)) or not hmac.compare_digest(raw_token(action), token)):
        raise invalid
    if purpose == 'change_email' and (not action.target_email or action.target_email != user.pending_email):
        raise invalid
    db.execute(update(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == purpose,
        AuthAction.used_at.is_(None)).values(used_at=now()))
    return user


def revoke_sessions(db, user_id):
    db.execute(update(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None)).values(revoked_at=now()))
