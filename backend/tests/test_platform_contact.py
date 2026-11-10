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


def test_platform_inbox_is_private_and_includes_existing_contacts(clients, database, monkeypatch):
    from uuid import UUID
    from sqlalchemy.orm import Session
    from test_platform_accounts import administrator

    visitor = clients()
    data = inquiry(); data['message'] = '<script>alert(1)</script> Consulta del sistema'
    receipt = visitor.mutate('POST', '/platform-contact', data).json()
    assert visitor.get('/admin/platform-contacts').status_code == 401
    owner = clients(); owner.register()
    assert owner.get('/admin/platform-contacts').status_code == 403
    admin = clients(); administrator(admin, monkeypatch)
    for status in ('queued', 'running', 'succeeded', 'failed', 'cancelled'):
        with Session(database[0]) as db:
            job = db.get(ProcessingJob, UUID(receipt['id']))
            job.status = status
            job.details = {**job.details, 'payload': {'private': 'no-exponer'}, 'provider_id': 'no-exponer'}
            db.add(ProcessingJob(kind='notify_auth', details={'platform_contact': data, 'secret': 'no-exponer'}))
            db.add(ProcessingJob(kind='notify_service', details={'request_id': str(uuid4())}))
            db.commit()
        response = admin.get('/admin/platform-contacts')
        assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
        body = response.json()
        assert body['total'] == 1 and body['limit'] == 50 and body['offset'] == 0
        item = body['items'][0]
        assert set(item) == {'id', 'email', 'phone', 'message', 'created_at'}
        assert item['id'] == receipt['id'] and item['email'] == data['email']
        assert item['message'] == data['message'] and item['phone'] == '1123456789'
        assert 'no-exponer' not in response.text
    assert admin.get('/admin/service-requests').json() == []


def test_platform_inbox_search_pagination_and_bounds(clients, database, monkeypatch):
    from datetime import datetime, timezone, timedelta
    from sqlalchemy.orm import Session
    from test_platform_accounts import administrator

    admin = clients(); administrator(admin, monkeypatch)
    created = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with Session(database[0]) as db:
        for index in range(3):
            db.add(ProcessingJob(kind='notify_service', created_at=created + timedelta(days=index), details={
                'platform_contact': {'email': f'contacto{index}@example.com', 'phone': f'112345678{index}',
                                     'message': f'Información de planes {index}'}}))
        db.commit()
    first = admin.get('/admin/platform-contacts?limit=2').json()
    second = admin.get('/admin/platform-contacts?limit=2&offset=2').json()
    assert first['total'] == second['total'] == 3
    assert [row['email'] for row in first['items']] == ['contacto2@example.com', 'contacto1@example.com']
    assert [row['email'] for row in second['items']] == ['contacto0@example.com']
    for term in ('CONTACTO1', '1123456781', 'planes 1'):
        body = admin.http.get('/api/v1/admin/platform-contacts', params={'q': term}).json()
        assert body['total'] == 1 and body['items'][0]['email'] == 'contacto1@example.com'
    for term in ('%', '_', 'inexistente'):
        body = admin.http.get('/api/v1/admin/platform-contacts', params={'q': term}).json()
        assert body['total'] == 0 and body['items'] == []
    for params in ({'limit': 0}, {'limit': 101}, {'offset': -1}, {'q': 'a' * 161}):
        assert admin.http.get('/api/v1/admin/platform-contacts', params=params).status_code == 422
    assert admin.get('/admin/platform-contacts?offset=100').json()['items'] == []
