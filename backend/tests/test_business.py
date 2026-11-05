from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4
import pytest
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.modules.organizations.models import Organization
from app.modules.properties.models import Property
from app.modules.studio.models import ServiceRequest
from test_assets import drain, ingest, jpeg
from test_phase3 import new_scene, new_tour


def organization(client, name='Equipo', kind='agency'):
    response = client.mutate('POST', '/organizations', {'name': name, 'kind': kind})
    assert response.status_code == 201, response.text
    return response.json()


def org_tour(client, org, title='Proyecto'):
    response = client.mutate('POST', f"/organizations/{org['id']}/tours", {'title': title, 'slug': 'tour-' + uuid4().hex[:12]})
    assert response.status_code == 201, response.text
    return response.json()


def test_multi_memberships_roles_revocation_and_personal_tours(clients):
    owner = clients(); owner.register()
    photographer = clients(); photographer.register('photo@example.com')
    other = clients(); other.register('other@example.com')
    a, b = organization(owner), organization(other, 'Otra empresa')
    personal = new_tour(owner)
    for actor, org in [(owner, a), (other, b)]:
        assert actor.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'photo@example.com', 'role': 'editor'}).status_code == 200
    assert len(photographer.get('/organizations').json()) == 2
    tour = org_tour(photographer, a)
    path = f"/tours/{tour['id']}"
    assert photographer.get(path).status_code == 200
    assert other.get(path).status_code == 404
    assert photographer.get(f"/tours/{personal['id']}").status_code == 404
    assert owner.get('/tours').json()[0]['id'] == personal['id']
    assert photographer.get('/tours').json() == []
    assert owner.mutate('PUT', f"/organizations/{a['id']}/members", {'email': 'photo@example.com', 'role': 'viewer'}).status_code == 200
    assert photographer.get(path).status_code == 200
    assert photographer.mutate('PUT', path, {'title': 'No', 'slug': tour['slug']}).status_code == 403
    assert photographer.mutate('POST', f"/organizations/{a['id']}/tours", {'title': 'No', 'slug': 'no'}).status_code == 403
    user_id = photographer.get('/auth/session').json()['user']['id']
    assert owner.mutate('DELETE', f"/organizations/{a['id']}/members/{user_id}").status_code == 204
    assert photographer.get(path).status_code == 404  # Ni el creador elude una revocación.
    owner_id = owner.get('/auth/session').json()['user']['id']
    assert owner.mutate('DELETE', f"/organizations/{a['id']}/members/{owner_id}").status_code == 409
    assert photographer.get(f"/organizations/{a['id']}/properties").status_code == 404


def test_property_client_links_api_and_database_isolation(clients, database):
    owner = clients(); owner.register()
    a, b = organization(owner), organization(owner, 'Segunda')
    client = owner.mutate('POST', f"/organizations/{a['id']}/clients", {'name': 'Cliente', 'email': 'client@example.com'}).json()
    data = {'title': 'Casa', 'kind': 'casa', 'locality': 'Buenos Aires', 'client_id': client['id']}
    assert owner.mutate('POST', f"/organizations/{b['id']}/properties", data).status_code == 404
    response = owner.mutate('POST', f"/organizations/{a['id']}/properties", data)
    assert response.status_code == 201, response.text
    prop = response.json()
    assert owner.mutate('POST', f"/organizations/{b['id']}/tours", {'title': 'Cross', 'slug': 'cross', 'property_id': prop['id']}).status_code == 404
    tour = owner.mutate('POST', f"/organizations/{a['id']}/tours", {'title': 'Casa', 'slug': 'casa', 'property_id': prop['id']})
    assert tour.status_code == 201 and tour.json()['property_id'] == prop['id']
    with database[0].begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(insert(Property).values(organization_id=UUID(b['id']), client_id=UUID(client['id']), title='Cross', kind='casa', locality='BA', address='', notes=''))


def test_org_quota_aggregates_different_creators_and_tour_limit_concurrent(clients, database):
    owner = clients(); owner.register()
    editor = clients(); editor.register('editor@example.com')
    org = organization(owner)
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'editor@example.com', 'role': 'editor'})
    first, second = org_tour(owner, org), org_tour(editor, org)
    scene = new_scene(owner, first)
    ingest(owner, first, scene, jpeg()); drain(database)
    with Session(database[0]) as db:
        record = db.get(Organization, UUID(org['id'])); record.storage_quota_bytes = 21 * 1024**2; record.tour_limit = 3; db.commit()
    second_scene = new_scene(editor, second)
    assert editor.mutate('POST', f"/tours/{second['id']}/scenes/{second_scene['id']}/uploads", {'size_bytes': 100, 'mime_type': 'image/jpeg'}).status_code == 413
    with ThreadPoolExecutor(2) as executor:
        responses = list(executor.map(lambda client: client.mutate('POST', f"/organizations/{org['id']}/tours", {'title': 'Concurrente', 'slug': 't-' + uuid4().hex}), [owner, editor]))
    assert sorted(response.status_code for response in responses) == [201, 409]


def service_payload():
    return {'submission_id': str(uuid4()), 'name': 'Persona de prueba', 'email': 'lead@example.com', 'whatsapp': '+54 9 11 1234-5678',
        'property_kind': 'casa', 'locality': 'Buenos Aires', 'area_m2': 85, 'rooms': 3, 'message': 'Consulta de prueba', 'consent': True}


def test_service_public_reception_idempotency_and_private_admin(clients, database, monkeypatch):
    public = clients()
    payload = service_payload()
    first = public.mutate('POST', '/service-requests', payload)
    assert first.status_code == 201, first.text
    assert public.mutate('POST', '/service-requests', payload).json()['id'] == first.json()['id']
    assert 'email' not in first.text and 'whatsapp' not in first.text
    assert public.get('/admin/service-requests').status_code == 401
    admin = clients(); admin.register()
    assert admin.get('/admin/service-requests').status_code == 403
    assert admin.mutate('POST', '/organizations', {'name': 'Studio', 'kind': 'studio'}).status_code == 403
    admin_id = UUID(admin.get('/auth/session').json()['user']['id'])
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [admin_id])
    assert admin.get('/business/access').json()['platform_admin']
    rows = admin.get('/admin/service-requests').json()
    assert len(rows) == 1 and rows[0]['email'] == payload['email']
    route = f"/admin/service-requests/{first.json()['id']}/status"
    assert admin.mutate('PUT', route, {'expected_status': 'SOLICITADO', 'status': 'ESTADO_INEXISTENTE'}).status_code == 422
    for previous, following in [('SOLICITADO', 'PRESUPUESTADO'), ('PRESUPUESTADO', 'CONFIRMADO'), ('CONFIRMADO', 'EN_PRODUCCION'), ('EN_PRODUCCION', 'CANCELADO')]:
        assert admin.mutate('PUT', route, {'expected_status': previous, 'status': following, 'note': 'Seguimiento'}).status_code == 200
    assert len(admin.get(f"/admin/service-requests/{first.json()['id']}/events").json()) == 4
    with Session(database[0]) as db:
        assert len(list(db.scalars(select(ServiceRequest)))) == 1


def test_public_request_validation_csrf_and_limit(clients):
    public = clients()
    assert public.http.post('/api/v1/service-requests', json=service_payload()).status_code == 403
    for update in [{'whatsapp': 'abc'}, {'consent': False}, {'rooms': 0}, {'website': 'spam'}, {'area_m2': -1}, {'status': 'FINALIZADO'}]:
        assert public.mutate('POST', '/service-requests', {**service_payload(), **update}).status_code == 422
    for _ in range(5): assert public.mutate('POST', '/service-requests', service_payload()).status_code == 201
    assert public.mutate('POST', '/service-requests', service_payload()).status_code == 429


def test_admin_limits_and_membership_privileges(clients, database, monkeypatch):
    owner = clients(); owner.register()
    colleague = clients(); colleague.register('admin-org@example.com')
    org = organization(owner)
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'admin-org@example.com', 'role': 'admin'})
    assert colleague.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'admin-org@example.com', 'role': 'owner'}).status_code == 403
    data = {'tour_limit': 2, 'member_limit': 3, 'storage_quota_bytes': 100000000}
    route = f"/admin/organizations/{org['id']}/limits"
    assert owner.mutate('PUT', route, data).status_code == 403
    account = owner.get('/auth/session').json()['user']['id']
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [UUID(account)])
    assert owner.mutate('PUT', route, data).status_code == 200
    assert owner.mutate('PUT', route, {**data, 'member_limit': 1}).status_code == 409
    assert owner.get('/organizations').json()[0]['tour_limit'] == 2


def test_org_media_readonly_and_foreign_owner_isolation(clients, database):
    owner = clients(); owner.register()
    viewer = clients(); viewer.register('viewer@example.com')
    foreign = clients(); foreign.register('foreign@example.com')
    org = organization(owner)
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'viewer@example.com', 'role': 'viewer'})
    tour = org_tour(owner, org); scene = new_scene(owner, tour)
    target = ingest(owner, tour, scene, jpeg()); drain(database)
    panorama_route = f"/tours/{tour['id']}/scenes/{scene['id']}/panorama"
    source = viewer.get(panorama_route).json()['sources'][0]['url']
    assert viewer.http.get(source).status_code == 200
    assert foreign.http.get(source).status_code == 404
    assert viewer.mutate('POST', f"/assets/{target['asset_id']}/complete").status_code == 403
    assert viewer.mutate('POST', f"/tours/{tour['id']}/scenes/{scene['id']}/uploads", {'size_bytes': 10, 'mime_type': 'image/jpeg'}).status_code == 403


def test_delete_client_permissions_csrf_and_related_property(clients):
    owner = clients(); owner.register()
    colleague = clients(); colleague.register('delete-editor@example.com')
    foreign = clients(); foreign.register('delete-foreign@example.com')
    org = organization(owner)
    base = f"/organizations/{org['id']}"
    customer = owner.mutate('POST', base + '/clients', {'name': 'Temporal'}).json()
    route = base + f"/clients/{customer['id']}"
    assert foreign.mutate('DELETE', route).status_code == 404
    assert owner.http.delete('/api/v1' + route).status_code == 403
    owner.mutate('PUT', base + '/members', {'email': 'delete-editor@example.com', 'role': 'viewer'})
    assert colleague.mutate('DELETE', route).status_code == 403
    prop = owner.mutate('POST', base + '/properties', {'title': 'Casa', 'kind': 'casa', 'locality': 'BA', 'client_id': customer['id']}).json()
    owner.mutate('PUT', base + '/members', {'email': 'delete-editor@example.com', 'role': 'editor'})
    assert colleague.mutate('DELETE', route).status_code == 204
    assert owner.get(base + '/clients').json() == []
    assert owner.get(base + '/properties').json()[0]['client_id'] == customer['id']
    assert owner.get(base + '/properties').json()[0]['id'] == prop['id']
    assert owner.mutate('PUT', route, {'name': 'No restaurar'}).status_code == 404
    assert owner.mutate('POST', base + '/properties', {'title': 'Nueva', 'kind': 'casa', 'locality': 'BA', 'client_id': customer['id']}).status_code == 404
    assert owner.mutate('DELETE', route).status_code == 404


def test_individual_spaces_keep_tours_and_jobs_separate(clients):
    from test_workflow import create_job
    owner = clients(); owner.register()
    outsider = clients(); outsider.register('foreign-individual@example.com')
    company = organization(owner, 'Remax', 'agency')
    person = organization(owner, 'Fernando', 'individual')
    assert person['kind'] == 'individual'
    job, _ = create_job(owner, person, name='Fernando')
    company_tour = org_tour(owner, company, 'Casa Remax')
    assert [tour['id'] for tour in owner.get(f"/organizations/{person['id']}/tours").json()] == [job['tour_id']]
    assert [tour['id'] for tour in owner.get(f"/organizations/{company['id']}/tours").json()] == [company_tour['id']]
    assert outsider.get(f"/organizations/{person['id']}/tours").status_code == 404
    assert outsider.get(f"/organizations/{person['id']}/jobs").status_code == 404
    assert {row['name']: row['kind'] for row in owner.get('/organizations').json()} == {'Remax': 'agency', 'Fernando': 'individual'}
