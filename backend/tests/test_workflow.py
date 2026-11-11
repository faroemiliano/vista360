from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.organizations.models import Organization
from app.modules.properties.models import Client, Property
from app.modules.studio.models import ServiceRequest
from app.modules.tours.models import Tour
from test_assets import drain, ingest, jpeg
from test_business import organization, service_payload
from test_phase3 import new_scene
from test_publications import publish


def create_job(owner, org, **values):
    payload = {**service_payload(), 'title': 'Casa para entregar', **values}
    result = owner.mutate('POST', f"/organizations/{org['id']}/jobs", payload)
    assert result.status_code == 201, result.text
    return result.json(), payload


def advance(owner, route, previous, following):
    result = owner.mutate('PUT', route + '/status', {'expected_status': previous, 'status': following, 'note': 'Seguimiento real'})
    assert result.status_code == 200, result.text
    return result.json()


def test_job_atomic_creation_reuse_and_idempotency(clients, database):
    owner = clients(); owner.register()
    org = organization(owner)
    job, payload = create_job(owner, org)
    base = f"/organizations/{org['id']}/jobs"
    assert job['client_name'] == payload['name'] and job['property_id'] and job['tour_id']
    assert job['public_path'] is None and job['status'] == 'SOLICITADO'
    assert owner.mutate('POST', base, payload).json()['id'] == job['id']
    assert owner.mutate('POST', base, {**payload, 'title': 'Otro'}).status_code == 409
    second, _ = create_job(owner, org, client_id=job['client_id'], property_id=job['property_id'])
    assert second['client_id'] == job['client_id'] and second['property_id'] == job['property_id']
    assert second['tour_id'] != job['tour_id']
    assert owner.mutate('POST', base, {**payload, 'submission_id': str(uuid4()), 'tour_id': job['tour_id']}).status_code == 409
    with Session(database[0]) as db:
        assert db.scalar(select(func.count()).select_from(Client)) == 1
        assert db.scalar(select(func.count()).select_from(Property)) == 1
        assert db.scalar(select(func.count()).select_from(Tour)) == 2
    assert owner.mutate('DELETE', f"/organizations/{org['id']}/clients/{job['client_id']}").status_code == 204
    assert owner.get(base + f"/{job['id']}").json()['client_id'] == job['client_id']
    assert owner.mutate('DELETE', f"/tours/{job['tour_id']}").status_code == 409
    assert owner.mutate('PUT', f"/organizations/{org['id']}/tours/{job['tour_id']}/property", {'property_id': None}).status_code == 409


@pytest.mark.parametrize('kind', ['individual', 'company'])
def test_new_work_uses_customer_profile_and_preserves_history(clients, database, kind):
    owner = clients(); owner.register()
    org = organization(owner, 'Emilio Disi', kind)
    profile = {'name': org['name'], 'contact_name': 'Ana Responsable', 'email': 'emilio@example.com',
               'phone': '+54 (11) 1234-5678 interno 234 atención comercial', 'locality': 'Buenos Aires'}
    assert owner.mutate('PUT', f"/organizations/{org['id']}", profile).status_code == 200
    payload = {key: value for key, value in service_payload().items() if key not in ('name', 'email', 'whatsapp')}
    payload.update(title='Casa de Emilio', use_customer_profile=True)
    base = f"/organizations/{org['id']}/jobs"
    result = owner.mutate('POST', base, payload)
    assert result.status_code == 201, result.text
    first = result.json()
    assert first['name'] == ('Emilio Disi' if kind == 'individual' else 'Ana Responsable')
    assert first['email'] == profile['email'] and first['whatsapp'] == profile['phone']
    assert first['client_name'] == first['name']
    # Un segundo trabajo utiliza el contacto interno existente, sin duplicarlo.
    second = owner.mutate('POST', base, {**payload, 'submission_id': str(uuid4())}).json()
    assert second['client_id'] == first['client_id'] and second['property_id'] != first['property_id']
    assert owner.mutate('PUT', f"/organizations/{org['id']}", {**profile, 'email': 'nuevo@example.com'}).status_code == 200
    # Reintentar no crea otro trabajo ni altera el contacto histórico.
    assert owner.mutate('POST', base, payload).json()['id'] == first['id']
    assert owner.get(base + '/' + first['id']).json()['email'] == 'emilio@example.com'
    third = owner.mutate('POST', base, {**payload, 'submission_id': str(uuid4()), 'email': 'ignorado@example.com'}).json()
    assert third['email'] == 'nuevo@example.com' and third['client_id'] != first['client_id']
    outsider = clients(); outsider.register('other-profile@example.com')
    assert outsider.mutate('POST', base, {**payload, 'submission_id': str(uuid4())}).status_code == 404


def test_profile_work_accepts_missing_optional_contact_without_relaxing_public_form(clients):
    owner = clients(); owner.register()
    org = organization(owner, 'E', 'individual')
    payload = {key: value for key, value in service_payload().items() if key not in ('name', 'email', 'whatsapp')}
    base = f"/organizations/{org['id']}/jobs"
    result = owner.mutate('POST', base, {**payload, 'title': 'Casa', 'use_customer_profile': True})
    assert result.status_code == 201, result.text
    assert result.json()['name'] == 'E' and result.json()['email'] == '' and result.json()['whatsapp'] == ''
    assert owner.mutate('POST', base, {**payload, 'title': 'Sin contacto'}).status_code == 422
    assert clients().mutate('POST', '/service-requests', payload).status_code == 422


def test_job_permissions_revocation_and_fk_isolation(clients, database, monkeypatch):
    owner = clients(); owner.register()
    viewer = clients(); viewer.register('reader-work@example.com')
    foreign = clients(); foreign.register('foreign-work@example.com')
    a, b = organization(owner), organization(foreign)
    job, payload = create_job(owner, a)
    base = f"/organizations/{a['id']}/jobs/{job['id']}"
    owner.mutate('PUT', f"/organizations/{a['id']}/members", {'email': 'reader-work@example.com', 'role': 'viewer'})
    assert viewer.get(base).status_code == 200
    assert viewer.get(base + '/events').status_code == 200
    assert viewer.mutate('PUT', base, {'expected_revision': job['work_revision']}).status_code == 403
    assert viewer.mutate('POST', base + '/delivery', {'expected_revision': job['work_revision'], 'note': 'No'}).status_code == 403
    assert foreign.get(base).status_code == 404
    assert foreign.get(f"/organizations/{b['id']}/jobs/{job['id']}").status_code == 404
    assert foreign.mutate('POST', f"/organizations/{b['id']}/jobs", {**payload, 'submission_id': str(uuid4()), 'client_id': job['client_id']}).status_code == 404
    assert foreign.get('/service-requests').status_code in (404, 405)
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [UUID(foreign.get('/auth/session').json()['user']['id'])])
    assert foreign.get('/admin/service-requests').json() == []  # Un trabajo manual no es un lead web global.
    assert foreign.get(f"/admin/service-requests/{job['id']}/events").status_code == 404
    reader_id = viewer.get('/auth/session').json()['user']['id']
    owner.mutate('DELETE', f"/organizations/{a['id']}/members/{reader_id}")
    assert viewer.get(base).status_code == 404
    with database[0].begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(update(ServiceRequest).where(ServiceRequest.id == UUID(job['id'])).values(organization_id=UUID(b['id'])))


def test_prepare_web_request_requires_staff_and_org_membership(clients, monkeypatch):
    public = clients()
    lead = public.mutate('POST', '/service-requests', service_payload()).json()
    owner = clients(); owner.register()
    org = organization(owner)
    route = f"/admin/service-requests/{lead['id']}/work"
    data = {'organization_id': org['id'], 'title': 'Trabajo del formulario'}
    assert owner.mutate('POST', route, data).status_code == 403
    admin_id = UUID(owner.get('/auth/session').json()['user']['id'])
    monkeypatch.setattr(get_settings(), 'platform_admin_user_ids', [admin_id])
    outsider = clients(); outsider.register('outsider-work@example.com')
    other = organization(outsider)
    assert owner.mutate('POST', route, {**data, 'organization_id': other['id']}).status_code == 404
    result = owner.mutate('POST', route, data)
    assert result.status_code == 200, result.text
    assert result.json()['id'] == lead['id'] and result.json()['tour_id']
    assert owner.mutate('POST', route, data).status_code == 409
    assert owner.get('/admin/service-requests').json()[0]['organization_id'] == org['id']


def test_visit_concurrency_timezone_and_terminal_state(clients):
    owner = clients(); owner.register()
    org = organization(owner)
    job, _ = create_job(owner, org)
    route = f"/organizations/{org['id']}/jobs/{job['id']}"
    data = {'expected_revision': job['work_revision'], 'scheduled_at': '2026-11-01T10:00:00-03:00', 'operations_notes': 'Acceso por portón lateral'}
    saved = owner.mutate('PUT', route, data)
    assert saved.status_code == 200 and saved.json()['operations_notes'] == data['operations_notes']
    assert owner.mutate('PUT', route, data).status_code == 409
    assert owner.mutate('PUT', route, {**data, 'expected_revision': saved.json()['work_revision'], 'scheduled_at': '2026-11-01T10:00:00'}).status_code == 422
    advance(owner, route, 'SOLICITADO', 'CONFIRMADO')
    cancelled = advance(owner, route, 'CONFIRMADO', 'CANCELADO')
    assert owner.mutate('PUT', route, {'expected_revision': cancelled['work_revision']}).status_code == 409
    assert owner.get(f"/organizations/{org['id']}/jobs?status=CANCELADO").json()[0]['id'] == job['id']
    reopened = advance(owner, route, 'CANCELADO', 'EN_PRODUCCION')
    assert owner.mutate('PUT', route, {'expected_revision': reopened['work_revision'], 'operations_notes': 'Reabierto'}).status_code == 200


def test_delivery_requires_active_current_publication_and_preserves_history(clients, database):
    owner = clients(); owner.register()
    org = organization(owner)
    job, _ = create_job(owner, org)
    route = f"/organizations/{org['id']}/jobs/{job['id']}"
    for previous, following in [('SOLICITADO', 'PRESUPUESTADO'), ('PRESUPUESTADO', 'CONFIRMADO'), ('CONFIRMADO', 'EN_PRODUCCION'), ('EN_PRODUCCION', 'EN_REVISION')]:
        job = advance(owner, route, previous, following)
    assert owner.mutate('PUT', route + '/status', {'expected_status': 'EN_REVISION', 'status': 'PUBLICADO'}).status_code == 409
    tour = owner.get(f"/tours/{job['tour_id']}").json()
    scene = new_scene(owner, tour); ingest(owner, tour, scene, jpeg()); drain(database)
    publish(owner, tour); drain(database)
    job = advance(owner, route, 'EN_REVISION', 'PUBLICADO')
    assert job['public_path'] == f"/tour/{tour['slug']}"
    assert owner.mutate('PUT', route + '/status', {'expected_status': 'PUBLICADO', 'status': 'FINALIZADO'}).status_code == 422
    owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Cambios pendientes', 'slug': tour['slug']})
    delivery = {'expected_revision': job['work_revision'], 'note': 'Enviado al contacto del cliente'}
    assert owner.mutate('POST', route + '/delivery', delivery).status_code == 409
    publish(owner, tour); drain(database)
    result = owner.mutate('POST', route + '/delivery', delivery)
    assert result.status_code == 200, result.text
    delivered = result.json()
    assert delivered['status'] == 'FINALIZADO' and delivered['delivered_at'] and delivered['delivered_version_id']
    assert owner.mutate('POST', route + '/delivery', delivery).status_code == 409
    assert 'Enviado al contacto' in owner.get(route + '/events').json()[-1]['note']
    advance(owner, route, 'FINALIZADO', 'EN_REVISION')
    delivered = advance(owner, route, 'EN_REVISION', 'FINALIZADO')
    assert delivered['delivered_at'] and delivered['delivered_version_id']
    anonymous = clients()
    assert anonymous.get(f"/public/tours/{tour['slug']}").status_code == 200
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish"); drain(database)
    final = owner.get(route).json()
    assert final['public_path'] is None and final['delivered_at'] == delivered['delivered_at']


def test_job_quota_atomic_rollback_and_concurrent_creation(clients, database):
    owner = clients(); owner.register()
    org = organization(owner)
    with Session(database[0]) as db:
        db.get(Organization, UUID(org['id'])).tour_limit = 1; db.commit()
    base = f"/organizations/{org['id']}/jobs"
    payloads = [{**service_payload(), 'title': 'Concurrente'} for _ in range(2)]
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda payload: owner.mutate('POST', base, payload), payloads))
    assert sorted(result.status_code for result in results) == [201, 409]
    with Session(database[0]) as db:
        for model in (ServiceRequest, Client, Property, Tour):
            assert db.scalar(select(func.count()).select_from(model)) == 1
