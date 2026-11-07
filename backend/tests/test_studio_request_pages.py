from uuid import UUID, uuid4
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings
from app.modules.assets.models import ProcessingJob
from app.modules.studio import notifications
from app.processing.worker import run_once
from test_business import organization, service_payload
from test_service_notifications import enable


def photographer(clients, email):
    client = clients(); client.register(email)
    return client, client.get('/workspaces').json()[0]


def activate(client, workspace):
    response = client.mutate('PUT', f"/workspaces/{workspace['id']}/request-page", {'enabled': True})
    assert response.status_code == 200
    return response.json()['request_token']


def submit(public, token, data=None):
    response = public.mutate('POST', f'/public/studios/{token}/service-requests', data or service_payload())
    assert response.status_code == 201, response.text
    return response.json()['id']


def test_page_is_opt_in_revocable_and_does_not_publish_private_metadata(clients):
    a, wa = photographer(clients, 'photo-a@example.com')
    b, _ = photographer(clients, 'photo-b@example.com')
    public = clients()
    assert wa['request_token'] is None
    assert public.get(f'/public/studios/{uuid4()}').status_code == 404
    assert b.mutate('PUT', f"/workspaces/{wa['id']}/request-page", {'enabled': True}).status_code == 404
    token = activate(a, wa)
    assert activate(a, wa) == token
    response = public.get(f'/public/studios/{token}')
    assert response.json() == {'name': wa['name']}
    assert response.headers['cache-control'] == 'no-store'
    org = organization(a)
    a.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'photo-b@example.com', 'role': 'editor'})
    shared = next(row for row in b.get('/workspaces').json() if row['id'] == wa['id'])
    assert shared['request_token'] is None and not shared['is_owner']
    assert b.get(f"/workspaces/{wa['id']}/service-requests").status_code == 404
    a.mutate('PUT', f"/workspaces/{wa['id']}/request-page", {'enabled': False})
    assert public.get(f'/public/studios/{token}').status_code == 404
    assert public.mutate('POST', f'/public/studios/{token}/service-requests', service_payload()).status_code == 404
    assert activate(a, wa) != token


def test_owners_and_platform_have_separate_inboxes_and_cannot_cross_ids(clients, monkeypatch):
    a, wa = photographer(clients, 'photo-a@example.com')
    b, wb = photographer(clients, 'photo-b@example.com')
    admin, _ = photographer(clients, 'platform@example.com')
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [UUID(admin.get('/auth/session').json()['user']['id'])])
    public = clients()
    aid, bid = submit(public, activate(a, wa)), submit(public, activate(b, wb))
    global_id = public.mutate('POST', '/service-requests', service_payload()).json()['id']
    base = f"/workspaces/{wa['id']}/service-requests"
    assert [row['id'] for row in a.get(base).json()] == [aid]
    assert [row['id'] for row in b.get(f"/workspaces/{wb['id']}/service-requests").json()] == [bid]
    assert [row['id'] for row in admin.get('/admin/service-requests').json()] == [global_id]
    for actor in (b, admin):
        for path in (base, f'{base}/{aid}', f'{base}/{aid}/events'):
            assert actor.get(path).status_code == 404
        assert actor.mutate('PUT', f'{base}/{aid}/status', {'expected_status': 'SOLICITADO', 'status': 'PRESUPUESTADO'}).status_code == 404
    assert admin.get(f'/admin/service-requests/{aid}').status_code == 404
    assert admin.mutate('PUT', f'/admin/service-requests/{aid}/status', {'expected_status': 'SOLICITADO', 'status': 'CANCELADO'}).status_code == 404
    assert a.get(f'{base}/{global_id}').status_code == 404
    assert a.mutate('PUT', f'{base}/{aid}/status', {'expected_status': 'SOLICITADO', 'status': 'PRESUPUESTADO', 'note': 'Contactado'}).status_code == 200
    assert a.get(f'{base}/{aid}/events').json()[0]['note'] == 'Contactado'


def test_idempotency_and_csrf_do_not_redirect_the_request(clients):
    a, wa = photographer(clients, 'photo-a@example.com')
    b, wb = photographer(clients, 'photo-b@example.com')
    ta, tb = activate(a, wa), activate(b, wb)
    public = clients(); data = service_payload()
    request_id = submit(public, ta, data)
    assert submit(public, ta, data) == request_id
    assert public.mutate('POST', f'/public/studios/{tb}/service-requests', data).status_code == 409
    assert public.mutate('POST', '/service-requests', data).status_code == 409
    assert b.get(f"/workspaces/{wb['id']}/service-requests").json() == []
    assert public.http.post(f'/api/v1/public/studios/{ta}/service-requests', json=service_payload()).status_code == 403


def test_assignment_stays_in_the_original_studio_and_disable_keeps_history(clients):
    a, wa = photographer(clients, 'photo-a@example.com')
    b, _ = photographer(clients, 'photo-b@example.com')
    oa, ob = organization(a), organization(b)
    b.mutate('PUT', f"/organizations/{ob['id']}/members", {'email': 'photo-a@example.com', 'role': 'editor'})
    request_id = submit(clients(), activate(a, wa))
    base = f"/workspaces/{wa['id']}/service-requests"
    assert a.mutate('POST', f'{base}/{request_id}/work', {'organization_id': ob['id'], 'title': 'Ajeno'}).status_code == 404
    response = a.mutate('POST', f'{base}/{request_id}/work', {'organization_id': oa['id'], 'title': 'Visita propia'})
    assert response.status_code == 200, response.text
    assert response.json()['organization_id'] == oa['id']
    assert a.get(f'{base}/{request_id}').json()['workspace_id'] == wa['id']
    a.mutate('PUT', f"/workspaces/{wa['id']}/request-page", {'enabled': False})
    assert a.get(f'{base}/{request_id}').status_code == 200
    assert b.get(f'{base}/{request_id}').status_code == 404


def test_test_sender_waits_and_verified_sender_sends_only_to_owner(clients, database, monkeypatch):
    enable(monkeypatch)
    a, workspace = photographer(clients, 'photo-a@example.com')
    request_id = submit(clients(), activate(a, workspace))
    factory = sessionmaker(database[0], expire_on_commit=False)
    monkeypatch.setattr(get_settings(), 'service_notification_from', 'onboarding@resend.dev')
    sent = []
    monkeypatch.setattr(notifications, 'send', lambda message, job: sent.append(message) or 'provider-1')
    assert not run_once(factory)
    assert a.get(f"/workspaces/{workspace['id']}/service-requests/{request_id}").json()['notification_status'] == 'not_configured'
    with factory() as db:
        job = db.scalar(select(ProcessingJob))
        assert job.attempts == 0 and job.details['recipient'] == 'photo-a@example.com'
    monkeypatch.setattr(get_settings(), 'service_notification_from', 'studio@example.com')
    assert run_once(factory)
    assert len(sent) == 1 and sent[0]['to'] == ['photo-a@example.com']
    assert f'estudio={workspace["id"]}' in sent[0]['text'] and f'solicitud={request_id}' in sent[0]['text']
    assert a.get(f"/workspaces/{workspace['id']}/service-requests/{request_id}").json()['notification_status'] == 'accepted'
