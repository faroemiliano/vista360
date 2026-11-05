import hashlib
import hmac
import secrets
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.models import AuthSession, User


def now() -> datetime:
    return datetime.now(timezone.utc)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_name(kind: str) -> str:
    prefix = "__Host-" if get_settings().cookie_secure else ""
    return f"{prefix}vista360_{kind}"


def set_cookie(response: Response, kind: str, value: str) -> None:
    response.set_cookie(cookie_name(kind), value, httponly=True,
                        secure=get_settings().cookie_secure, samesite="lax", path="/",
                        max_age=get_settings().session_ttl_seconds)


def clear_cookie(response: Response, kind: str) -> None:
    response.delete_cookie(cookie_name(kind), path="/", httponly=True,
                           secure=get_settings().cookie_secure, samesite="lax")


def sign_csrf(nonce: str, session_token: str | None) -> str:
    context = session_token or "anonymous"
    return hmac.new(get_settings().csrf_secret.get_secret_value().encode(),
                    f"{context}:{nonce}".encode(), hashlib.sha256).hexdigest()


def issue_csrf(response: Response, session_token: str | None) -> str:
    nonce = secrets.token_hex(32)
    value = f"{nonce}.{sign_csrf(nonce, session_token)}"
    set_cookie(response, "csrf", value)
    return value


def require_csrf(request: Request) -> None:
    if request.headers.get("origin") not in get_settings().cors_origins:
        raise HTTPException(403, "Origen no autorizado")
    cookie = request.cookies.get(cookie_name("csrf"), "")
    header = request.headers.get("x-csrf-token", "")
    if not re.fullmatch(r"[a-f0-9]{64}\.[a-f0-9]{64}", cookie) or len(header) != 129 or not header.isascii() or not hmac.compare_digest(cookie, header):
        raise HTTPException(403, "Token CSRF inválido")
    nonce, signature = cookie.split(".", 1)
    expected = sign_csrf(nonce, request.cookies.get(cookie_name("session")))
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(403, "Token CSRF inválido")


def csrf_for_request(request: Request, response: Response, session_token: str | None) -> str:
    cookie = request.cookies.get(cookie_name("csrf"), "")
    if re.fullmatch(r"[a-f0-9]{64}\.[a-f0-9]{64}", cookie):
        nonce, signature = cookie.split(".", 1)
        if hmac.compare_digest(signature, sign_csrf(nonce, session_token)):
            return cookie
    return issue_csrf(response, session_token)


def resolve_session(request: Request, db: Session) -> AuthSession | None:
    raw = request.cookies.get(cookie_name("session"), "")
    if not raw or len(raw) > 128:
        return None
    return db.scalar(select(AuthSession).where(
        AuthSession.token_hash == token_hash(raw),
        AuthSession.revoked_at.is_(None), AuthSession.expires_at > now(),
    ))


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session = resolve_session(request, db)
    user = db.get(User, session.user_id) if session else None
    if not user:
        raise HTTPException(401, "Iniciá sesión para continuar")
    request.state.auth_session = session
    return user


class AuthThrottle:
    """Límite básico por IP y proceso. Reemplazar por límite compartido al desplegar."""
    def __init__(self, limit: int = 30):
        self.limit = limit
        self.attempts = defaultdict(deque)
        self.lock = Lock()

    def check(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        timestamp = monotonic()
        with self.lock:
            if len(self.attempts) > 10000:
                # Limpiar claves expiradas sin desalojar límites activos.
                for address in list(self.attempts):
                    if not self.attempts[address] or self.attempts[address][-1] < timestamp - 600:
                        del self.attempts[address]
                if len(self.attempts) > 10000 and key not in self.attempts:
                    raise HTTPException(429, "Demasiados intentos, intentá más tarde")
            attempts = self.attempts[key]
            while attempts and attempts[0] < timestamp - 600:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise HTTPException(429, "Demasiados intentos, intentá más tarde", headers={"Retry-After": "600"})
            attempts.append(timestamp)
