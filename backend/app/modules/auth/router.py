import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth import service
from app.modules.auth.models import User
from app.modules.auth.schemas import Credentials, SessionResponse, UserResponse, EmailInput, ActionInput, ResetPasswordInput, ChangePasswordInput, AuthMessage, EmailStatus, ProfileInput, ChangeEmailInput
from app.modules.auth.security import (
    clear_cookie, cookie_name, current_user, authenticated_user, csrf_for_request, now, require_csrf, resolve_session,
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


def throttle(request: Request, db: Session = Depends(get_db)):
    from app.modules.auth.limits import ip
    ip(db, request)


@router.post("/register", response_model=SessionResponse, status_code=201,
             dependencies=[Depends(require_csrf), Depends(throttle)])
def register(data: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.register(data, request, response, db)


@router.post("/login", response_model=SessionResponse,
             dependencies=[Depends(require_csrf), Depends(throttle)])
def login(data: Credentials, request: Request, response: Response, db: Session = Depends(get_db)):
    return service.login(data, request, response, db)


@router.post("/logout", status_code=204, dependencies=[Depends(require_csrf)])
def logout(request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    session = request.state.auth_session
    session.revoked_at = now()
    db.commit()
    clear_cookie(response, "session")
    clear_cookie(response, "csrf")


@router.post('/forgot-password', response_model=AuthMessage, dependencies=[Depends(require_csrf)])
def forgot_password(data: EmailInput, request: Request, db: Session = Depends(get_db)):
    return service.request_email(db, request, str(data.email), 'reset')


@router.post('/resend-verification', response_model=AuthMessage, dependencies=[Depends(require_csrf)])
def resend_verification(request: Request, db: Session = Depends(get_db), user: User = Depends(authenticated_user)):
    return service.request_email(db, request, user.email_normalized, 'verify')


@router.post('/verify-email', response_model=AuthMessage, dependencies=[Depends(require_csrf), Depends(throttle)])
def verify_email(data: ActionInput, db: Session = Depends(get_db)):
    return service.verify_email(db, data.token.get_secret_value())


@router.post('/reset-password', response_model=AuthMessage, dependencies=[Depends(require_csrf), Depends(throttle)])
def reset_password(data: ResetPasswordInput, db: Session = Depends(get_db)):
    return service.reset_password(db, data.token.get_secret_value(), data.password.get_secret_value())


@router.post('/change-password', response_model=SessionResponse, dependencies=[Depends(require_csrf)])
def change_password(data: ChangePasswordInput, request: Request, response: Response, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.change_password(db, user, data, request, response)


@router.get('/email-status', response_model=EmailStatus)
def email_status():
    from app.core.config import get_settings
    from app.modules.studio.notifications import transport_configured
    if not transport_configured():
        return {'general_delivery_available': False}
    return {'general_delivery_available': not str(get_settings().service_notification_from).lower().endswith('@resend.dev')}


@router.put('/profile', response_model=UserResponse, dependencies=[Depends(require_csrf)])
def save_profile(data: ProfileInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.auth.profile import save
    return save(db, user, data)


@router.post('/change-email', response_model=AuthMessage, dependencies=[Depends(require_csrf)])
def request_email_change(data: ChangeEmailInput, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.auth.profile import change_email
    return change_email(db, user, data, request)


@router.delete('/change-email', response_model=UserResponse, dependencies=[Depends(require_csrf)])
def cancel_email_change(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.auth.profile import cancel_email
    return cancel_email(db, user)


@router.post('/confirm-email-change', response_model=AuthMessage, dependencies=[Depends(require_csrf), Depends(throttle)])
def confirm_email_change(data: ActionInput, db: Session = Depends(get_db)):
    from app.modules.auth.profile import confirm_email
    return confirm_email(db, data.token.get_secret_value())


@router.put('/avatar', response_model=UserResponse, dependencies=[Depends(require_csrf)])
async def upload_avatar(request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.auth import avatar, limits
    await run_in_threadpool(limits.ip, db, request, 'avatar', 10)
    if request.headers.get('content-type', '').split(';')[0].lower() not in ('image/jpeg', 'image/png', 'image/webp'):
        raise HTTPException(415, 'Usá una foto JPEG, PNG o WebP')
    with TemporaryDirectory(prefix='vision360-avatar-input-') as directory:
        source = Path(directory) / 'input'
        total = 0
        try:
            async with asyncio.timeout(60):
                with source.open('wb') as stream:
                    async for block in request.stream():
                        total += len(block)
                        if total > avatar.MAX_BYTES:
                            raise HTTPException(413, 'La foto debe pesar hasta 5 MiB')
                        stream.write(block)
        except TimeoutError:
            raise HTTPException(408, 'La carga tardó demasiado. Intentá nuevamente.') from None
        async with request.app.state.avatar_slot:
            return await run_in_threadpool(avatar.save, db, user, source)


@router.delete('/avatar', response_model=UserResponse, dependencies=[Depends(require_csrf)])
def delete_avatar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.modules.auth.avatar import clear
    return clear(db, user)


@router.get('/avatar')
def read_avatar(db: Session = Depends(get_db), user: User = Depends(current_user)):
    from app.storage.factory import get_storage
    if not user.avatar_key:
        raise HTTPException(404, 'Todavía no cargaste una foto')
    storage = get_storage(user.avatar_backend)
    url = storage.read_url(user.avatar_key, 60)
    if url:
        return RedirectResponse(url, headers={'Cache-Control': 'no-store'})
    path = storage.path(user.avatar_key)
    if not path.is_file():
        raise HTTPException(404, 'Foto no disponible')
    return FileResponse(path, media_type='image/jpeg', headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'})
