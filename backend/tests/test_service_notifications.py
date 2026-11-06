from datetime import timedelta
import json
from uuid import UUID
from urllib.error import HTTPError

import pytest
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.modules.assets.models import ProcessingJob
from app.modules.auth.security import now
from app.modules.studio import notifications
from app.processing.worker import claim, run_once
from test_business import service_payload


def enable(monkeypatch):
    settings = get_settings()
    for key, value in dict(resend_api_key=SecretStr('test-only-not-a-real-key'),
        service_notification_to='operator@example.com', service_notification_from='studio@example.com',
        public_app_url='https://vision.example.com').items():
        monkeypatch.setattr(settings, key, value)


def submit(client):
    data = service_payload()
    data['message'] = '<img src=x onerror=alert(1)> Consulta con dos ambientes'
    response = client.mutate('POST', '/service-requests', data)
    assert response.status_code == 201
    return data, response.json()['id']


def test_submission_and_notification_are_atomic_idempotent_and_private(clients, database, monkeypatch):
    client = clients()
    data, request_id = submit(client)
    assert client.mutate('POST', '/service-requests', data).json()['id'] == request_id
    factory = sessionmaker(database[0], expire_on_commit=False)
    with factory() as db:
        jobs = list(db.scalars(select(ProcessingJob).where(ProcessingJob.kind == 'notify_service')))
        assert len(jobs) == 1 and jobs[0].details == {'request_id': request_id}
    monkeypatch.setattr(get_settings(), 'resend_api_key', None)
    assert not run_once(factory)  # Queda pendiente hasta activar el correo.
    assert client.get(f'/admin/service-requests/{request_id}').status_code == 401
    client.register('admin@example.com')
    assert client.get(f'/admin/service-requests/{request_id}').status_code == 403
    user_id = UUID(client.get('/auth/session').json()['user']['id'])
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [user_id])
    response = client.get(f'/admin/service-requests/{request_id}')
    assert response.status_code == 200
    assert response.json()['notification_status'] == 'not_configured'
    assert client.get('/admin/service-requests').json()[0]['id'] == request_id


def test_worker_sends_escaped_content_and_exact_request_link_once(clients, database, monkeypatch):
    enable(monkeypatch)
    client = clients()
    _, request_id = submit(client)
    sent = []
    def send(message, job_id):
        sent.append((message, job_id))
        return 'provider-123'
    monkeypatch.setattr(notifications, 'send', send)
    factory = sessionmaker(database[0], expire_on_commit=False)
    assert run_once(factory)
    assert not run_once(factory)
    assert len(sent) == 1
    message, _ = sent[0]
    assert message['to'] == ['operator@example.com']
    assert message['reply_to'] == 'lead@example.com'
    assert f'https://vision.example.com/studio/solicitudes?solicitud={request_id}' in message['text']
    assert '<img' not in message['html'] and '&lt;img' in message['html']
    with factory() as db:
        job = db.scalar(select(ProcessingJob))
        assert job.status == 'succeeded' and job.details['provider_id'] == 'provider-123'
        assert 'test-only' not in json.dumps(job.details)


def test_worker_retries_same_payload_without_losing_request(clients, database, monkeypatch):
    enable(monkeypatch)
    client = clients()
    _, request_id = submit(client)
    calls = []
    def send(message, job_id):
        calls.append((message, job_id))
        if len(calls) == 1:
            raise notifications.NotificationError('email_unavailable', retry=True)
        return 'provider-retry'
    monkeypatch.setattr(notifications, 'send', send)
    factory = sessionmaker(database[0], expire_on_commit=False)
    assert run_once(factory)
    assert client.mutate('POST', '/service-requests', service_payload()).status_code == 201
    with factory() as db:
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.details['request_id'].astext == request_id))
        assert job.status == 'queued' and job.attempts == 1
        job.available_at = now() - timedelta(seconds=1)
        db.commit()
    # Cambiar la configuración no altera el payload de un envío ya intentado.
    monkeypatch.setattr(get_settings(), 'service_notification_to', 'changed@example.com')
    assert run_once(factory)
    assert calls[0] == calls[1]


def test_three_failed_attempts_keep_the_consultation_available(clients, database, monkeypatch):
    enable(monkeypatch)
    client = clients()
    _, request_id = submit(client)
    attempts = []
    def unavailable(message, job_id):
        attempts.append(job_id)
        raise notifications.NotificationError('email_unavailable', retry=True)
    monkeypatch.setattr(notifications, 'send', unavailable)
    factory = sessionmaker(database[0], expire_on_commit=False)
    for attempt in range(3):
        assert run_once(factory)
        with factory() as db:
            job = db.scalar(select(ProcessingJob))
            assert job.attempts == attempt + 1
            if attempt < 2:
                assert job.status == 'queued'
                job.available_at = now() - timedelta(seconds=1)
                db.commit()
            else:
                assert job.status == 'failed'
                from app.modules.studio.models import ServiceRequest
                assert db.get(ServiceRequest, UUID(request_id)).name == 'Persona de prueba'
    assert len(attempts) == 3 and not run_once(factory)


def test_expired_lease_is_recovered_and_old_retry_is_not_resent(clients, database, monkeypatch):
    enable(monkeypatch)
    submit(clients())
    factory = sessionmaker(database[0], expire_on_commit=False)
    ticket = claim(factory)
    assert ticket
    with factory() as db:
        job = db.get(ProcessingJob, ticket['id'])
        job.lease_expires_at = now() - timedelta(seconds=1)
        job.details = {**job.details, 'payload': {'to': ['operator@example.com']},
                       'first_attempt_at': (now() - timedelta(hours=24)).isoformat()}
        db.commit()
    monkeypatch.setattr(notifications, 'send', lambda *args: pytest.fail('No debe reenviarse fuera de la ventana idempotente'))
    assert run_once(factory)
    with factory() as db:
        job = db.get(ProcessingJob, ticket['id'])
        assert job.status == 'failed' and job.error_code == 'email_retry_expired'


def test_https_transport_uses_auth_idempotency_timeout_and_no_real_email(monkeypatch):
    enable(monkeypatch)
    captured = []
    class Response:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, limit): return b'{"id":"message-id"}'
    def open_request(request, timeout):
        captured.append((request, timeout))
        return Response()
    monkeypatch.setattr(notifications, 'urlopen', open_request)
    assert notifications.send({'to': ['operator@example.com']}, 'fixed-job') == 'message-id'
    request, timeout = captured[0]
    assert request.full_url == 'https://api.resend.com/emails' and timeout == 10
    headers = {key.lower(): value for key, value in request.header_items()}
    assert headers['idempotency-key'] == 'service-notification/fixed-job'
    assert headers['authorization'].startswith('Bearer ')


@pytest.mark.parametrize('code,retry', [(403, False), (422, False), (429, True), (503, True)])
def test_transport_classifies_provider_errors_without_leaking_content(monkeypatch, code, retry):
    enable(monkeypatch)
    def denied(*args, **kwargs):
        raise HTTPError('https://api.resend.com/emails', code, 'private data', {}, None)
    monkeypatch.setattr(notifications, 'urlopen', denied)
    with pytest.raises(notifications.NotificationError) as error:
        notifications.send({}, 'fixed-job')
    assert error.value.retry is retry
    assert 'private data' not in str(error.value)
