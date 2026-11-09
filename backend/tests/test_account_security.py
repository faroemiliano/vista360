from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.modules.auth import actions, mail
from app.modules.auth.models import AuthAction, AuthRateBucket, User
from app.modules.assets.models import ProcessingJob
from app.modules.auth.security import now, token_hash
from app.processing.worker import run_once
from test_service_notifications import enable

PASSWORD = 'New-test-password-456!'


def action_token(database, email='owner@example.com', purpose='reset'):
    with Session(database[0]) as db:
        user = db.scalar(select(User).where(User.email_normalized == email))
        action = db.scalar(select(AuthAction).where(AuthAction.user_id == user.id, AuthAction.purpose == purpose).order_by(AuthAction.created_at.desc()))
        raw = actions.raw_token(action)
        assert action.token_hash == token_hash(raw) and action.token_hash != raw
        return raw, action.id


def test_registration_gate_single_use_and_pending_logout(clients, database, monkeypatch):
    monkeypatch.setattr(get_settings(), 'auth_require_verified_email', True)
    client = clients(); response = client.register()
    assert response.json()['user']['email_verification_required'] is True
    assert client.get('/workspaces').status_code == 403
    token, _ = action_token(database, purpose='verify')
    assert client.mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code == 400
    assert client.mutate('POST', '/auth/verify-email', {'token': token + 'bad'}).status_code == 400
    assert client.mutate('POST', '/auth/verify-email', {'token': token}).status_code == 200
    assert client.get('/auth/session').json()['user']['email_verified_at'] is not None
    assert client.get('/workspaces').status_code == 200
    assert client.mutate('POST', '/auth/verify-email', {'token': token}).status_code == 400
    pending = clients(); pending.register('pending@example.com')
    assert pending.mutate('POST', '/auth/logout').status_code == 204


def test_default_registration_does_not_falsely_mark_verified(clients):
    client = clients(); user = client.register().json()['user']
    assert user['email_verification_required'] is False and user['email_verified_at'] is None
    assert client.get('/workspaces').status_code == 200


def test_reset_generic_response_and_revocation_on_consumption(clients, database):
    owner = clients(); owner.register()
    second = clients(); second.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': 'Test-password-123!'})
    visitor = clients()
    unknown = visitor.mutate('POST', '/auth/forgot-password', {'email': 'unknown@example.com'})
    known = visitor.mutate('POST', '/auth/forgot-password', {'email': 'OWNER@example.com'})
    assert unknown.status_code == known.status_code == 200 and unknown.json() == known.json()
    assert owner.get('/workspaces').status_code == 200
    token, _ = action_token(database)
    assert visitor.mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code == 200
    assert visitor.get('/auth/session').json()['user'] is None
    assert owner.get('/workspaces').status_code == second.get('/workspaces').status_code == 401
    assert visitor.mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code == 400
    assert visitor.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': 'Test-password-123!'}).status_code == 401
    assert visitor.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': PASSWORD}).status_code == 200


def test_password_change_requires_old_password_and_cancels_sessions_and_reset_links(clients, database):
    owner = clients(); owner.register()
    second = clients(); second.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': 'Test-password-123!'})
    second.mutate('POST', '/auth/forgot-password', {'email': 'owner@example.com'})
    token, _ = action_token(database)
    assert owner.mutate('POST', '/auth/change-password', {'current_password': 'Wrong-password-123!', 'password': PASSWORD}).status_code == 401
    assert second.get('/workspaces').status_code == 200
    response = owner.mutate('POST', '/auth/change-password', {'current_password': 'Test-password-123!', 'password': PASSWORD})
    assert response.status_code == 200, response.text
    assert owner.get('/workspaces').status_code == 200
    assert second.get('/workspaces').status_code == 401
    assert clients().mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code == 400


def test_expiry_and_concurrent_reset_only_one_consumer(clients, database):
    owner = clients(); owner.register(); owner.mutate('POST', '/auth/forgot-password', {'email': 'owner@example.com'})
    token, action_id = action_token(database)
    with Session(database[0]) as db:
        db.execute(update(AuthAction).where(AuthAction.id == action_id).values(expires_at=now()-timedelta(seconds=1))); db.commit()
    assert owner.mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code == 400
    owner.mutate('POST', '/auth/forgot-password', {'email': 'owner@example.com'})
    token, _ = action_token(database)
    consumers = [clients(), clients()]
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda client: client.mutate('POST', '/auth/reset-password', {'token': token, 'password': PASSWORD}).status_code, consumers))
    assert sorted(statuses) == [200, 400]


def test_persistent_account_limits_across_app_instances_and_expiry(clients, database):
    for _ in range(10):
        assert clients().mutate('POST', '/auth/login', {'email': 'missing@example.com', 'password': PASSWORD}).status_code == 401
    assert clients().mutate('POST', '/auth/login', {'email': 'MISSING@example.com', 'password': PASSWORD}).status_code == 429
    with Session(database[0]) as db:
        rows = list(db.scalars(select(AuthRateBucket)))
        assert len(rows) == 2 and all(len(row.key_hash) == 64 for row in rows)
        db.execute(update(AuthRateBucket).values(started_at=now()-timedelta(minutes=11))); db.commit()
    assert clients().mutate('POST', '/auth/login', {'email': 'missing@example.com', 'password': PASSWORD}).status_code == 401


def test_reset_request_limits_and_csrf(clients):
    client = clients()
    assert client.http.post('/api/v1/auth/forgot-password', json={'email': 'person@example.com'}).status_code == 403
    for _ in range(3):
        assert client.mutate('POST', '/auth/forgot-password', {'email': 'person@example.com'}).status_code == 200
    assert client.mutate('POST', '/auth/forgot-password', {'email': 'PERSON@example.com'}).status_code == 429
    assert client.mutate('POST', '/auth/reset-password', {'token': 'bad', 'password': 'short'}).status_code == 422


def test_auth_mail_tokens_not_saved_and_trial_not_redirected_to_operator(clients, database, monkeypatch):
    enable(monkeypatch); monkeypatch.setattr(get_settings(), 'auth_require_verified_email', True)
    client = clients(); client.register()
    token, _ = action_token(database, purpose='verify')
    sent = []; monkeypatch.setattr(mail, 'send', lambda payload, job_id: sent.append(payload) or 'email-test')
    factory = sessionmaker(database[0], expire_on_commit=False)
    monkeypatch.setattr(get_settings(), 'service_notification_from', 'onboarding@resend.dev')
    assert not run_once(factory)
    monkeypatch.setattr(get_settings(), 'service_notification_from', 'cuentas@example.com')
    assert run_once(factory)
    assert sent[0]['to'] == ['owner@example.com']
    assert '/cuenta/verificar#token=' + token in sent[0]['text']
    with Session(database[0]) as db:
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.kind == 'notify_auth'))
        assert job.status == 'succeeded' and token not in str(job.details) and 'payload' not in job.details
    assert not run_once(factory)


def test_email_delivery_status_reflects_trial_limit(clients, monkeypatch):
    client = clients()
    monkeypatch.setattr(get_settings(), 'resend_api_key', None)
    assert client.get('/auth/email-status').json() == {'general_delivery_available': False}
    enable(monkeypatch)
    assert client.get('/auth/email-status').json() == {'general_delivery_available': True}
    monkeypatch.setattr(get_settings(), 'service_notification_from', 'onboarding@resend.dev')
    assert client.get('/auth/email-status').json() == {'general_delivery_available': False}
