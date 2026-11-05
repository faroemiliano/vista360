from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.workspaces.models import Workspace
from test_business import organization
from test_workflow import create_job


def owned(client):
    response = client.get('/workspaces')
    assert response.status_code == 200
    return next(row for row in response.json() if row['is_owner'])


def test_separate_studios_and_private_work_ids(clients):
    a, b = clients(), clients()
    a.register('studio-a@example.com'); b.register('studio-b@example.com')
    wa, wb = owned(a), owned(b)
    assert wa['id'] != wb['id']
    for actor, workspace, name in [(a, wa, 'Fotografía de Ana'), (b, wb, 'Fotografía de Bruno')]:
        assert actor.mutate('PUT', f"/workspaces/{workspace['id']}", {'name': name}).json()['name'] == name
    ca, cb = organization(a, 'Remax'), organization(b, 'Remax')
    assert ca['workspace_id'] == wa['id'] and cb['workspace_id'] == wb['id']
    ja, _ = create_job(a, ca)
    jb, _ = create_job(b, cb)
    assert [row['id'] for row in a.get(f"/organizations?workspace_id={wa['id']}").json()] == [ca['id']]
    assert [row['id'] for row in b.get(f"/organizations?workspace_id={wb['id']}").json()] == [cb['id']]
    for actor, foreign_workspace, foreign_client, foreign_job in [(a, wb, cb, jb), (b, wa, ca, ja)]:
        assert actor.get(f"/organizations?workspace_id={foreign_workspace['id']}").status_code == 404
        assert actor.get(f"/organizations?workspace_id={foreign_workspace['id']}&include_deleted=true").status_code == 404
        assert actor.mutate('PUT', f"/workspaces/{foreign_workspace['id']}", {'name': 'Intrusión'}).status_code == 404
        assert actor.mutate('POST', '/organizations', {'workspace_id': foreign_workspace['id'], 'name': 'Intrusión', 'kind': 'agency'}).status_code == 404
        assert actor.get(f"/organizations/{foreign_client['id']}/jobs/{foreign_job['id']}").status_code == 404
        assert actor.get(f"/tours/{foreign_job['tour_id']}").status_code == 404
        assert actor.mutate('DELETE', f"/organizations/{foreign_client['id']}").status_code == 404


def test_shared_client_does_not_grant_the_rest_of_a_studio(clients):
    owner, guest = clients(), clients()
    owner.register(); guest.register('guest@example.com')
    wo, wg = owned(owner), owned(guest)
    shared, private = organization(owner, 'Compartido'), organization(owner, 'Privado')
    assert owner.mutate('PUT', f"/organizations/{shared['id']}/members", {'email': 'guest@example.com', 'role': 'viewer'}).status_code == 200
    visible = guest.get('/workspaces').json()
    assert {row['id'] for row in visible} == {wo['id'], wg['id']}
    assert next(row for row in visible if row['id'] == wo['id'])['is_owner'] is False
    assert guest.get(f"/organizations?workspace_id={wg['id']}").json() == []
    rows = guest.get(f"/organizations?workspace_id={wo['id']}").json()
    assert [(row['id'], row['role']) for row in rows] == [(shared['id'], 'viewer')]
    assert guest.get(f"/organizations/{private['id']}/tours").status_code == 404
    assert guest.mutate('PUT', f"/workspaces/{wo['id']}", {'name': 'No'}).status_code == 403
    assert guest.mutate('POST', '/organizations', {'workspace_id': wo['id'], 'name': 'No', 'kind': 'agency'}).status_code == 403
    assert guest.mutate('POST', f"/organizations/{shared['id']}/tours", {'title': 'No', 'slug': 'no'}).status_code == 403
    guest_id = guest.get('/auth/session').json()['user']['id']
    assert owner.mutate('DELETE', f"/organizations/{shared['id']}/members/{guest_id}").status_code == 204
    assert [row['id'] for row in guest.get('/workspaces').json()] == [wg['id']]
    assert guest.get(f"/organizations?workspace_id={wo['id']}").status_code == 404


def test_workspace_survives_client_deletion_and_login_without_duplicates(clients, database):
    owner = clients(); owner.register()
    studio = owned(owner)
    org = organization(owner)
    assert owner.mutate('DELETE', f"/organizations/{org['id']}").status_code == 204
    assert owner.get('/workspaces').json() == [studio]
    assert owner.get(f"/organizations?workspace_id={studio['id']}").json() == []
    assert owner.get(f"/organizations?workspace_id={studio['id']}&include_deleted=true").json()[0]['id'] == org['id']
    for _ in range(2):
        assert owner.mutate('POST', '/auth/logout').status_code == 204
        owner.csrf = owner.get('/auth/session').json()['csrf_token']
        assert owner.mutate('POST', '/auth/login', {'email': 'owner@example.com', 'password': 'Test-password-123!'}).status_code == 200
        assert owned(owner)['id'] == studio['id']
    with Session(database[0]) as db:
        assert db.scalar(select(func.count()).select_from(Workspace)) == 1


def test_workspace_auth_csrf_and_validation(clients):
    actor = clients()
    assert actor.get('/workspaces').status_code == 401
    actor.register()
    studio = owned(actor)
    path = f"/workspaces/{studio['id']}"
    assert actor.http.put('/api/v1' + path, json={'name': 'No CSRF'}).status_code == 403
    for name in ['', '   ', 'x' * 161]:
        assert actor.mutate('PUT', path, {'name': name}).status_code == 422
    assert actor.mutate('PUT', f'/workspaces/{uuid4()}', {'name': 'No existe'}).status_code == 404
    assert actor.mutate('POST', '/organizations', {'workspace_id': str(uuid4()), 'name': 'No', 'kind': 'individual'}).status_code == 404
    assert owned(actor)['name'] == studio['name']
