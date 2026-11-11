from test_business import organization
from test_workflow import create_job, advance
from test_phase3 import new_scene
from test_assets import ingest, jpeg, drain
from test_publications import publish


def document(job, **changes):
    return dict(expected_revision=job['work_revision'], studio_name='Estúdio Luz 360',
                contact='equipo@example.com · +54 9 11 2345 6789',
                conditions='Alojamiento: 6 meses desde la entrega.\nUna ronda de ajustes de textos y conexiones.', **changes)


def test_delivery_document_permissions_validation_and_concurrency(clients):
    owner = clients(); owner.register()
    org = organization(owner)
    job, _ = create_job(owner, org)
    assert job['delivery_document'] is None and job['delivery_location'] is None
    base = f"/organizations/{org['id']}/jobs/{job['id']}"
    route = base + '/delivery-document'
    assert clients().mutate('PUT', route, document(job)).status_code == 401
    viewer = clients(); viewer.register('viewer-document@example.com')
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'viewer-document@example.com', 'role': 'viewer'})
    assert viewer.mutate('PUT', route, document(job)).status_code == 403
    stranger = clients(); stranger.register('stranger-document@example.com')
    assert stranger.mutate('PUT', route, document(job)).status_code == 404
    assert owner.http.put('/api/v1' + route, json=document(job)).status_code == 403
    for changes in ({'conditions': ''}, {'studio_name': ' '}, {'contact': ''}, {'conditions': 'x' * 5001},
                    {'studio_name': 'x' * 161}, {'contact': 'x' * 301}, {'expected_revision': -1}, {'maps_url': 'javascript:alert(1)'}):
        assert owner.mutate('PUT', route, {**document(job), **changes}).status_code == 422
    saved = owner.mutate('PUT', route, document(job))
    assert saved.status_code == 200, saved.text
    saved = saved.json()
    assert saved['delivery_document'] == {key: value for key, value in document(job).items() if key != 'expected_revision'}
    assert saved['work_revision'] == job['work_revision'] + 1 and saved['status'] == job['status']
    assert owner.mutate('PUT', route, document(job)).status_code == 409
    assert viewer.get(base).json()['delivery_document'] == saved['delivery_document']
    assert owner.get(base + '/events').json()[-1]['note'] == 'Se actualizaron los datos y condiciones del documento de entrega.'


def test_document_uses_published_location_and_remains_private(clients, database):
    owner = clients(); owner.register()
    org = organization(owner)
    job, _ = create_job(owner, org)
    base = f"/organizations/{org['id']}/jobs/{job['id']}"
    tour = owner.get(f"/tours/{job['tour_id']}").json()
    scene = new_scene(owner, tour); ingest(owner, tour, scene, jpeg()); drain(database)
    published_location = {'label': 'https://maps.app.goo.gl/entrega360', 'latitude': None, 'longitude': None}
    tour_data = {'title': tour['title'], 'slug': tour['slug'], 'public_location': published_location}
    assert owner.mutate('PUT', f"/tours/{tour['id']}", tour_data).status_code == 200
    publish(owner, tour); drain(database)
    assert owner.get(base).json()['delivery_location'] == published_location
    # El PDF no debe tomar una dirección modificada que aún no se publicó.
    assert owner.mutate('PUT', f"/tours/{tour['id']}", {**tour_data, 'public_location': {'label': 'Nueva dirección sin publicar'}}).status_code == 200
    job = owner.get(base).json()
    assert job['delivery_location'] == published_location and job['has_unpublished_changes']
    job = owner.mutate('PUT', base + '/delivery-document', document(job)).json()
    public = clients().get(f"/public/tours/{tour['slug']}")
    assert public.status_code == 200
    assert 'Alojamiento' not in public.text and 'equipo@example.com' not in public.text
    publish(owner, tour); drain(database)
    job = advance(owner, base, 'SOLICITADO', 'PUBLICADO')
    delivered = owner.mutate('POST', base + '/delivery', {'expected_revision': job['work_revision'], 'note': 'Entrega real'}).json()
    updated = owner.mutate('PUT', base + '/delivery-document', {**document(delivered), 'conditions': 'Condiciones corregidas de común acuerdo.'}).json()
    assert updated['status'] == 'FINALIZADO' and updated['delivered_at'] == delivered['delivered_at']
    assert updated['public_path'] == delivered['public_path']
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish"); drain(database)
    retained = owner.get(base).json()
    assert retained['delivery_document'] == updated['delivery_document']
    assert retained['delivery_location'] is None and retained['public_path'] is None
