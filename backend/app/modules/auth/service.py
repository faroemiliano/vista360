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
    user = User(email_normalized=data.email, password_hash=password_hasher.hash(data.password.get_secret_value()))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese email") from None
    return start_session(user, request, response, db)


def login(data: Credentials, request: Request, response: Response, db: Session) -> SessionResponse:
    user = db.scalar(select(User).where(User.email_normalized == data.email))
    try:
        password_hasher.verify(user.password_hash if user else dummy_hash, data.password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, "Email o contraseña incorrectos") from None
    if not user:
        raise HTTPException(401, "Email o contraseña incorrectos")
    if password_hasher.check_needs_rehash(user.password_hash):
        user.password_hash = password_hasher.hash(data.password.get_secret_value())
    return start_session(user, request, response, db)
