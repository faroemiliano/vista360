from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth import service
from app.modules.auth.models import User
from app.modules.auth.schemas import Credentials, SessionResponse, UserResponse
from app.modules.auth.security import (
    clear_cookie, cookie_name, current_user, csrf_for_request, now, require_csrf, resolve_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/session", response_model=SessionResponse)
def session_state(request: Request, response: Response, db: Session = Depends(get_db)):
    session = resolve_session(request, db)
    user = db.get(User, session.user_id) if session else None
    raw = request.cookies.get(cookie_name("session")) if user else None
    if not user:
        clear_cookie(response, "session")
    csrf = csrf_for_request(request, response, raw)
    return SessionResponse(user=UserResponse.model_validate(user) if user else None, csrf_token=csrf)


def throttle(request: Request):
    request.app.state.auth_throttle.check(request)


@router.post("/register", response_model=SessionResponse, status_code=201,
             dependencies=[Depends(require_csrf), Depends(throttle)])
def register(data: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.register(data, request, response, db)


@router.post("/login", response_model=SessionResponse,
             dependencies=[Depends(require_csrf), Depends(throttle)])
def login(data: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.login(data, request, response, db)


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf)])
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    session = request.state.auth_session
    session.revoked_at = now()
    db.commit()
    clear_cookie(response, "session")
    clear_cookie(response, "csrf")
