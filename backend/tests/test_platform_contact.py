from uuid import uuid4

import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import sessionmaker

from app.modules.assets.models import ProcessingJob
from app.modules.studio.models import ServiceRequest
from app.modules.studio import notifications
from app.processing.worker import run_once
from test_service_notifications import enable


def inquiry(**changes):
    return dict(submission_id=str(uuid4()), email='visitor@example.com', phone='11 2345-6789',
                message='Quiero conocer cómo funciona el sistema y su seguridad.', **changes)


def test_contact_is_durable_idempotent_and_separate_from_photo_requests(clients, database, monkeypatch):
    client = clients(); data = inquiry()
    first = client.mutate('POST', '/platform-contact', data)
    assert first.status_code == 201, first.text
    assert client.mutate('POST', '/platform-contact', data).json() == first.json()
    assert client.mutate('POST', '/platform-contact', {**data, 'message': 'Otra consulta diferente'}).status_code == 409
    factory = sessionmaker(database[0], expire_on_commit=False)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(ServiceRequest)) == 0
        jobs = list(db.scalars(select(ProcessingJob)))
        assert len(jobs) == 1
        assert jobs[0].details['recipient'] == 'farixio.tech@gmail.com'
        assert jobs[0].details['platform_contact']['phone'] == '1123456789'
    monkeypatch.setattr(notifications, 'transport_configured', lambda: False)
    assert not run_once(factory)
    assert client.get('/admin/service-requests').status_code == 401
    assert client.get('/platform-contact').status_code == 405


def test_contact_notification_to_owner_is_escaped_and_does_not_send_to_visitor(clients, database, monkeypatch):
    enable(monkeypatch)
    sent = []
    monkeypatch.setattr(notifications, 'send', lambda payload, job_id: sent.append(payload) or 'provider-test')
    data = inquiry(); data['message'] = '<script>alert(1)</script> Quiero conocer el sistema'
    assert clients().mutate('POST', '/platform-contact', data).status_code == 201
    factory = sessionmaker(database[0], expire_on_commit=False)
    assert run_once(factory)
    assert len(sent) == 1
    assert sent[0]['to'] == ['farixio.tech@gmail.com']
    assert sent[0]['reply_to'] == data['email']
    assert 'Consulta sobre el sistema' in sent[0]['subject']
    assert '<script>' not in sent[0]['html'] and '&lt;script&gt;' in sent[0]['html']
    assert '1123456789' in sent[0]['text']
    assert not run_once(factory)


@pytest.mark.parametrize('changes', [{'email': 'correo-invalido'}, {'phone': '0000000000'},
    {'phone': '123'}, {'phone': 'abcdefghij'}, {'message': 'corto'}, {'website': 'spam'},
    {'recipient': 'otro@example.com'}])
def test_contact_validates_required_contact_data(clients, changes):
    data = inquiry(); data.update(changes)
    assert clients().mutate('POST', '/platform-contact', data).status_code == 422


def test_contact_requires_csrf_and_limits_abuse(clients):
    client = clients()
    assert client.http.post('/api/v1/platform-contact', json=inquiry()).status_code == 403
    for _ in range(5):
        assert client.mutate('POST', '/platform-contact', inquiry()).status_code == 201
    assert client.mutate('POST', '/platform-contact', inquiry()).status_code == 429
