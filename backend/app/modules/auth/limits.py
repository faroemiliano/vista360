"""Contadores compartidos entre procesos; no guardan IPs ni emails en claro."""
from datetime import timedelta
import hashlib
import hmac

from fastapi import HTTPException
from sqlalchemy import case, delete, func
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.modules.auth.models import AuthRateBucket


def check(db, scope, identity, limit, seconds=600):
    key = hmac.new(get_settings().csrf_secret.get_secret_value().encode(),
                   f'auth-rate:{scope}:{identity}'.encode(), hashlib.sha256).hexdigest()
    table = AuthRateBucket.__table__
    expired = table.c.started_at <= func.statement_timestamp() - timedelta(seconds=seconds)
    statement = insert(table).values(key_hash=key, started_at=func.statement_timestamp(), attempts=1)
    statement = statement.on_conflict_do_update(index_elements=[table.c.key_hash], set_={
        'started_at': case((expired, func.statement_timestamp()), else_=table.c.started_at),
        'attempts': case((expired, 1), else_=table.c.attempts + 1),
    }).returning(table.c.attempts)
    count = db.scalar(statement)
    db.execute(delete(AuthRateBucket).where(AuthRateBucket.started_at < func.statement_timestamp() - timedelta(days=1)))
    db.commit()  # También persiste los intentos que fallan o quedan limitados.
    if count > limit:
        raise HTTPException(429, 'Demasiados intentos, intentá más tarde', headers={'Retry-After': str(seconds)})


def ip(db, request, scope='access', limit=30):
    check(db, f'ip:{scope}', request.client.host if request.client else 'unknown', limit)
