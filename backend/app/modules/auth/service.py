import secrets
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import AuthSession, User
from app.modules.auth.schemas import Credentials, SessionResponse, UserResponse
from app.modules.auth.security import cookie_name, issue_csrf, now, set_cookie, token_hash

password_hasher = PasswordHasher()
dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))


def start_session(user: User, request: Request, response: Response, db: Session) -> SessionResponse:
    from app.modules.workspaces.service import ensure_owned_workspace
    ensure_owned_workspace(db, user)
    old = request.cookies.get(cookie_name("session"))
    if old:
        db.execute(update(AuthSession).where(AuthSession.token_hash == token_hash(old)).values(revoked_at=now()))
    raw = secrets.token_urlsafe(32)
    db.add(AuthSession(user_id=user.id, token_hash=token_hash(raw),
                       expires_at=now() + timedelta(seconds=get_settings().session_ttl_seconds)))
    db.commit()
    set_cookie(response, "session", raw)
    csrf = issue_csrf(response, raw)
    return SessionResponse(user=UserResponse.model_validate(user), csrf_token=csrf)


def register(data: Credentials, request: Request, response: Response, db: Session) -> SessionResponse:
    user = User(email_normalized=data.email, password_hash=password_hasher.hash(data.password.get_secret_value()),
                email_verification_required=get_settings().auth_require_verified_email)
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email") from None
    from app.modules.auth.actions import issue
    if user.email_verification_required:
        issue(db, user, 'verify')
    return start_session(user, request, response, db)


def login(data: Credentials, request: Request, response: Response, db: Session) -> SessionResponse:
    from app.modules.auth.limits import check
    check(db, 'account:login', data.email, 10)
    user = db.scalar(select(User).where(User.email_normalized == data.email).with_for_update())
    try:
        password_hasher.verify(user.password_hash if user else dummy_hash, data.password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, "Email o contraseña incorrectos") from None
    if not user:
        raise HTTPException(401, "Email o contraseña incorrectos")
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(data.password.get_secret_value())
    return start_session(user, request, response, db)


def request_email(db, request, email, purpose):
    from app.modules.auth import actions, limits
    limits.ip(db, request, 'email', 10)
    limits.check(db, f'account:email:{purpose}', email, 3, 3600)
    user = db.scalar(select(User).where(User.email_normalized == email))
    if user and (purpose == 'reset' or user.email_verified_at is None):
        actions.issue(db, user, purpose)
        db.commit()
    return {'message': actions.GENERIC_EMAIL}


def verify_email(db, token):
    from app.modules.auth.actions import consume
    user = consume(db, token, 'verify')
    user.email_verified_at = now()
    db.commit()
    return {'message': 'Email verificado. Ya podés ingresar a tu estudio.'}


def reset_password(db, token, password):
    from app.modules.auth.actions import consume, revoke_sessions
    user = consume(db, token, 'reset')
    user.password_hash = password_hasher.hash(password)
    revoke_sessions(db, user.id)
    db.commit()
    return {'message': 'Contraseña actualizada. Iniciá sesión con tu nueva contraseña.'}


def change_password(db, user, data, request, response):
    from app.modules.auth import actions, limits
    limits.ip(db, request, 'password-change', 10)
    limits.check(db, 'account:password-change', str(user.id), 10)
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    try:
        password_hasher.verify(user.password_hash, data.current_password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, 'La contraseña actual es incorrecta') from None
    user.password_hash = password_hasher.hash(data.password.get_secret_value())
    actions.revoke_sessions(db, user.id)
    from app.modules.auth.models import AuthAction
    db.execute(update(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == 'reset',
        AuthAction.used_at.is_(None)).values(used_at=now()))
    return start_session(user, request, response, db)
