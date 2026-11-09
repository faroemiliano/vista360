from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.modules.auth import actions, limits
from app.modules.auth.models import AuthAction, User
from app.modules.auth.security import now
from app.modules.auth.service import password_hasher
from argon2.exceptions import InvalidHashError, VerificationError


def save(db, user, data):
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    for key, value in data.model_dump().items():
        setattr(user, key, value)
    if user.account_kind == 'individual':
        user.company_name = None
    db.commit()
    return user


def change_email(db, user, data, request):
    limits.ip(db, request, 'email-change', 10)
    limits.check(db, 'account:email-change', str(user.id), 3, 3600)
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    try:
        password_hasher.verify(user.password_hash, data.current_password.get_secret_value())
    except (VerificationError, InvalidHashError):
        raise HTTPException(401, 'La contraseña actual es incorrecta') from None
    target = str(data.email)
    if target == user.email_normalized:
        raise HTTPException(400, 'Ese ya es tu email de acceso')
    if db.scalar(select(User.id).where(User.email_normalized == target)):
        raise HTTPException(409, 'Ese email ya está en uso')
    db.execute(update(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == 'change_email', AuthAction.used_at.is_(None)).values(used_at=now()))
    user.pending_email = target
    actions.issue(db, user, 'change_email', target_email=target)
    db.commit()
    return {'message': 'Solicitamos la confirmación al nuevo email. Seguí ingresando con tu email actual hasta confirmarlo.'}


def cancel_email(db, user):
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    user.pending_email = None
    db.execute(update(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == 'change_email', AuthAction.used_at.is_(None)).values(used_at=now()))
    db.commit()
    return user


def confirm_email(db, token):
    user = actions.consume(db, token, 'change_email')
    # consume sólo marca como usados los enlaces del mismo propósito.
    target = user.pending_email
    if not target or db.scalar(select(User.id).where(User.email_normalized == target, User.id != user.id)):
        db.rollback()
        raise HTTPException(409, 'El nuevo email ya no está disponible. Solicitá otro cambio desde Mi cuenta.')
    user.email_normalized = target
    user.pending_email = None
    user.email_verified_at = now()
    actions.revoke_sessions(db, user.id)
    db.execute(update(AuthAction).where(AuthAction.user_id == user.id, AuthAction.used_at.is_(None)).values(used_at=now()))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'El nuevo email ya está en uso. Solicitá otro cambio.') from None
    return {'message': 'Email actualizado y verificado. Iniciá sesión con tu nuevo email.'}
