from uuid import UUID

import pytest
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.modules.organizations.models import Organization
from app.modules.properties.models import Client, Property
from app.modules.studio.models import ServiceRequest
from test_assets import drain, ingest, jpeg
from test_business import organization, org_tour, service_payload
from test_phase3 import new_scene
from test_publications import publish
from test_workflow import create_job, advance


@pytest.mark.parametrize('kind', ['agency', 'individual'])
def test_delete_contact_and_organization_preserves_published_delivered_work(clients, database, kind):
    owner = clients(); owner.register()
    other = clients(); other.register('other-history@example.com')
    org = organization(owner, 'Contratante histórico', kind)
    job, _ = create_job(owner, org, name='Nombre del contacto original')
    base = f"/organizations/{org['id']}"
    path = base + f"/jobs/{job['id']}"
    tour = owner.get(f"/tours/{job['tour_id']}").json()
    scene = new_scene(owner, tour)
    ingest(owner, tour, scene, jpeg()); drain(database)
    publish(owner, tour); drain(database)
    job = advance(owner, path, 'SOLICITADO', 'PUBLICADO')
    delivered = owner.mutate('POST', path + '/delivery', {'expected_revision': job['work_revision'], 'note': 'Enviado antes de eliminar el contacto'}).json()
    history = owner.get(path + '/events').json()
    public_path = f"/public/tours/{tour['slug']}"
    public = owner.get(public_path).json()
    assert owner.mutate('DELETE', base + f"/clients/{job['client_id']}").status_code == 204
    assert owner.get(base + '/clients').json() == []
    preserved = owner.get(path).json()
    assert preserved['client_name'] == delivered['client_name'] and preserved['client_deleted']
    for key in ['id', 'title', 'tour_id', 'property_id', 'name', 'email', 'whatsapp', 'status', 'delivered_at', 'delivered_version_id', 'public_path', 'work_revision']:
        assert preserved[key] == delivered[key]
    assert owner.mutate('DELETE', base).status_code == 204
    assert owner.get('/organizations').json() == []
    historical = owner.get('/organizations?include_deleted=true').json()
    assert len(historical) == 1 and historical[0]['deleted_at'] and historical[0]['name'] == org['name']
    assert owner.get(base + '/jobs').json()[0]['id'] == job['id']
    assert owner.get(path + '/events').json() == history
    assert owner.get(public_path).json() == public
    assert other.get('/organizations?include_deleted=true').json() == []
    assert other.get(path).status_code == 404
    assert other.get(f"/tours/{tour['id']}").status_code == 404
    anonymous = clients()
    assert anonymous.get(public_path).status_code == 200
    panorama = owner.get(f"/tours/{tour['id']}/scenes/{scene['id']}/panorama")
    assert panorama.status_code == 200
    assert owner.http.get(panorama.json()['sources'][0]['url']).status_code == 200
    # A deleted organization still permits its members to continue an existing job.
    reopened = advance(owner, path, 'FINALIZADO', 'EN_PRODUCCION')
    assert owner.mutate('PUT', path, {'expected_revision': reopened['work_revision'], 'operations_notes': 'Continuar el trabajo conservado'}).status_code == 200
    assert owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Recorrido conservado editable', 'slug': tour['slug']}).status_code == 200
    assert owner.mutate('POST', base + '/jobs', {**service_payload(), 'title': 'Nuevo bloqueado'}).status_code == 409
    assert owner.mutate('POST', base + '/tours', {'title': 'Nuevo', 'slug': 'blocked-new-tour'}).status_code == 409
    assert owner.mutate('POST', base + '/clients', {'name': 'Nuevo'}).status_code == 409
    assert owner.mutate('POST', base + '/properties', {'title': 'Nueva', 'kind': 'casa', 'locality': 'BA'}).status_code == 409
    assert owner.mutate('DELETE', base).status_code == 404
    with Session(database[0]) as db:
        assert db.get(Organization, UUID(org['id'])).deleted_at
        assert db.get(Client, UUID(job['client_id'])).deleted_at
        assert db.get(Property, UUID(job['property_id'])).client_id == UUID(job['client_id'])
        assert db.scalar(select(func.count()).select_from(ServiceRequest)) == 1


def test_organization_deletion_requires_owner_csrf_and_preserves_membership_revocation(clients):
    owner = clients(); owner.register()
    member = clients(); member.register('archive-member@example.com')
    outsider = clients(); outsider.register('archive-foreign@example.com')
    org = organization(owner)
    base = f"/organizations/{org['id']}"
    tour = org_tour(owner, org)
    assert outsider.mutate('DELETE', base).status_code == 404
    assert owner.http.delete('/api/v1' + base).status_code == 403
    assert owner.get('/organizations?include_deleted=true').json()[0]['deleted_at'] is None
    for role in ['viewer', 'editor', 'admin']:
        owner.mutate('PUT', base + '/members', {'email': 'archive-member@example.com', 'role': role})
        assert member.mutate('DELETE', base).status_code == 403
    assert owner.mutate('DELETE', base).status_code == 204
    assert member.get(f"/tours/{tour['id']}").status_code == 200
    account_id = member.get('/auth/session').json()['user']['id']
    assert owner.mutate('DELETE', base + f'/members/{account_id}').status_code == 204
    assert member.get(f"/tours/{tour['id']}").status_code == 404
    assert member.get('/organizations?include_deleted=true').json() == []


def test_deleted_organization_frees_active_space_limit(clients):
    owner = clients(); owner.register()
    first = organization(owner, 'Primera')
    for index in range(9): organization(owner, f'Otra {index}')
    assert owner.mutate('POST', '/organizations', {'name': 'Sin espacio', 'kind': 'agency'}).status_code == 409
    assert owner.mutate('DELETE', f"/organizations/{first['id']}").status_code == 204
    assert organization(owner, 'Reemplazo')['name'] == 'Reemplazo'
    assert len(owner.get('/organizations').json()) == 10
    assert len(owner.get('/organizations?include_deleted=true').json()) == 11
