"""Consultas sobre la plataforma, independientes de los pedidos de fotografía."""
import hashlib
from html import escape
import re
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.exc import IntegrityError

from app.modules.assets.models import ProcessingJob

OWNER_EMAIL = 'farixio.tech@gmail.com'


class PlatformContactInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    submission_id: UUID
    email: EmailStr = Field(max_length=254)
    phone: str = Field(min_length=8, max_length=40)
    message: str = Field(min_length=10, max_length=5000)
    website: str = Field(default='', max_length=0)

    @field_validator('phone')
    @classmethod
    def valid_phone(cls, value):
        value = re.sub(r'[\s().-]', '', value)
        if not (re.fullmatch(r'\+[1-9][0-9]{7,14}', value) or re.fullmatch(r'[1-9][0-9]{9}', value)):
            raise ValueError('Ingresá un teléfono de 10 dígitos con código de área, o usá + y el código de país')
        if len(set(value.lstrip('+'))) == 1:
            raise ValueError('Ingresá un teléfono de contacto válido')
        return value


class PlatformContactReceipt(BaseModel):
    id: UUID
    message: str = 'Tu consulta quedó registrada para Emiliano.'


def submit(db, data, request):
    request.app.state.service_throttle.check(request)
    contact = data.model_dump(exclude={'submission_id', 'website'}, mode='json')
    fingerprint = hashlib.sha256(data.model_dump_json(exclude={'submission_id', 'website'}).encode()).hexdigest()
    previous = db.get(ProcessingJob, data.submission_id)
    if previous:
        if previous.kind != 'notify_service' or previous.details.get('contact_fingerprint') != fingerprint:
            raise HTTPException(409, 'La referencia corresponde a otra consulta. Volvé a iniciar el formulario')
        return PlatformContactReceipt(id=previous.id)
    job = ProcessingJob(id=data.submission_id, kind='notify_service', details={
        'platform_contact': contact, 'contact_fingerprint': fingerprint, 'recipient': OWNER_EMAIL})
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = db.get(ProcessingJob, data.submission_id)
        if not previous or previous.details.get('contact_fingerprint') != fingerprint:
            raise HTTPException(409, 'No se pudo registrar la consulta con esa referencia') from None
    return PlatformContactReceipt(id=data.submission_id)


def payload(contact):
    from app.core.config import get_settings
    fields = [('Email', contact['email']), ('Teléfono', contact['phone']), ('Consulta', contact['message'])]
    text = 'Consulta sobre el sistema Vision360\n\n' + '\n'.join(f'{key}: {value}' for key, value in fields)
    html = '<h1>Consulta sobre el sistema Vision360</h1>' + ''.join(
        f'<p><strong>{escape(key)}</strong><br><span style="white-space:pre-wrap">{escape(value)}</span></p>'
        for key, value in fields)
    return {'from': str(get_settings().service_notification_from), 'to': [OWNER_EMAIL],
            'reply_to': contact['email'], 'subject': 'Vision360 · Consulta sobre el sistema', 'text': text, 'html': html}
