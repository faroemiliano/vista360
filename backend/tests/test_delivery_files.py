from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4
from sqlalchemy.orm import Session
from app.modules.studio.models import ServiceRequest
from app.storage.factory import get_storage
from test_business import organization
from test_delivery_document import document
from test_workflow import create_job
from test_phase3 import new_scene
from test_assets import ingest, jpeg, drain
from test_publications import publish
from test_workspaces import owned


def prepared(owner, org, database):
    job, _ = create_job(owner, org)
    base = f"/organizations/{org['id']}/jobs/{job['id']}"
    tour = owner.get(f"/tours/{job['tour_id']}").json()
    scene = new_scene(owner, tour); ingest(owner, tour, scene, jpeg()); drain(database)
    owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Hotel & Spa', 'slug': tour['slug'], 'public_location': {'label': 'https://maps.app.goo.gl/entrega360'}})
    publish(owner, tour); drain(database)
    result = owner.mutate('PUT', base + '/delivery-document', document(owner.get(base).json()))
    assert result.status_code == 200, result.text
    return base, result.json(), tour


def payload(job, **changes):
    return dict(expected_revision=job['work_revision'], expected_file_id=(job['delivery_file'] or {}).get('id'), **changes)


def path(base, job):
    return base + '/delivery-document/files/' + job['delivery_file']['id']


def test_file_persistence_permissions_and_retention(clients, database):
    owner = clients(); owner.register()
    org = organization(owner, 'Remax')
    base, job, tour = prepared(owner, org, database)
    quota = f"/workspaces/{owned(owner)['id']}/subscription"
    before = owner.get(quota).json()['usage']['storage_reserved_bytes']
    result = owner.mutate('POST', base + '/delivery-document/file', payload(job))
    assert result.status_code == 200, result.text
    saved = result.json(); file = saved['delivery_file']; url = path(base, saved)
    assert set(file) == {'id', 'filename', 'created_at', 'size_bytes'}
    assert file['filename'].startswith('Entrega_Remax_Hotel-Spa_') and file['filename'].endswith('.pdf')
    assert saved['status'] == job['status'] and saved['delivered_at'] == job['delivered_at']
    assert owner.get(quota).json()['usage']['storage_reserved_bytes'] == before + file['size_bytes']
    inline = owner.get(url)
    assert inline.status_code == 200 and inline.headers['content-type'] == 'application/pdf'
    assert inline.headers['content-disposition'].startswith('inline;')
    assert 'no-store' in inline.headers['cache-control']
    assert inline.headers['x-content-type-options'] == 'nosniff'
    assert inline.content.startswith(b'%PDF-') and len(inline.content) == file['size_bytes']
    assert b'/Type /Page' in inline.content and b'https://maps.app.goo.gl/entrega360' in inline.content
    assert f"/tour/{tour['slug']}".encode() in inline.content
    download = owner.get(url + '?download=1')
    assert download.content == inline.content
    assert download.headers['content-disposition'] == f'attachment; filename="{file["filename"]}"'
    assert owner.get(base).json()['delivery_file'] == file
    job = owner.mutate('PUT', base + '/delivery-document', {**document(saved), 'conditions': 'Cambios sin regenerar.'}).json()
    assert job['delivery_file'] == file and owner.get(url).content == inline.content
    assert owner.mutate('POST', base + '/delivery-document/file', payload(saved)).status_code == 409
    assert owner.mutate('POST', base + '/delivery-document/file', {**payload(job), 'expected_file_id': None}).status_code == 409
    assert clients().get(url).status_code == 401
    stranger = clients(); stranger.register('stranger-file@example.com')
    assert stranger.get(url).status_code == 404
    assert stranger.mutate('POST', base + '/delivery-document/file', payload(job)).status_code == 404
    viewer = clients(); viewer.register('viewer-file@example.com')
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'viewer-file@example.com', 'role': 'viewer'})
    assert viewer.get(url).content == inline.content
    assert viewer.mutate('POST', base + '/delivery-document/file', payload(job)).status_code == 403
    assert owner.http.post('/api/v1' + base + '/delivery-document/file', json=payload(job)).status_code == 403
    owner.mutate('DELETE', f"/organizations/{org['id']}/members/{viewer.get('/auth/session').json()['user']['id']}")
    assert viewer.get(url).status_code == 404
    assert owner.get(base + '/delivery-document/files/' + str(uuid4())).status_code == 404
    assert 'delivery_file' not in clients().get('/public/tours/' + tour['slug']).text
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish"); drain(database)
    assert owner.get(base).json()['delivery_file'] == file and owner.get(url).content == inline.content
    assert owner.mutate('POST', base + '/delivery-document/file', payload(owner.get(base).json())).status_code == 409
    owner.mutate('DELETE', f"/organizations/{org['id']}")
    assert owner.get(url).content == inline.content


def test_replacement_failure_and_concurrent_generation(clients, database, monkeypatch):
    owner = clients(); owner.register()
    org = organization(owner)
    base, job, _ = prepared(owner, org, database)
    saved = owner.mutate('POST', base + '/delivery-document/file', payload(job)).json()
    original = owner.get(path(base, saved)).content
    with Session(database[0]) as db:
        old_key = db.get(ServiceRequest, UUID(job['id'])).delivery_file['key']
    from app.modules.studio import delivery_pdf
    storage = get_storage()
    class BrokenStorage:
        def put(self, *args, **kwargs):
            raise OSError('storage unavailable')
        def delete(self, *args):
            pass
    with monkeypatch.context() as patch:
        patch.setattr(delivery_pdf, 'get_storage', lambda *args: BrokenStorage())
        assert owner.mutate('POST', base + '/delivery-document/file', payload(saved)).status_code == 503
    assert owner.get(base).json()['delivery_file'] == saved['delivery_file']
    assert owner.get(path(base, saved)).content == original
    changed = owner.mutate('PUT', base + '/delivery-document', {**document(saved), 'conditions': '<b>Texto literal</b>\n' + 'Ajustes y condiciones. ' * 200}).json()
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: owner.mutate('POST', base + '/delivery-document/file', payload(changed, language='pt-BR')), range(2)))
    assert sorted(result.status_code for result in results) == [200, 409]
    latest = owner.get(base).json()
    assert latest['delivery_file']['id'] != saved['delivery_file']['id']
    assert owner.get(path(base, latest)).content != original
    assert owner.get(path(base, saved)).status_code == 404
    assert not storage.path(old_key).exists()
    for changes in ({'language': 'unknown'}, {'timezone_offset_minutes': 10000}):
        assert owner.mutate('POST', base + '/delivery-document/file', {**payload(latest), **changes}).status_code == 422


def test_generation_requires_saved_data_and_publication(clients):
    owner = clients(); owner.register()
    org = organization(owner)
    job, _ = create_job(owner, org)
    base = f"/organizations/{org['id']}/jobs/{job['id']}"
    assert owner.mutate('POST', base + '/delivery-document/file', payload(job)).status_code == 409
    saved = owner.mutate('PUT', base + '/delivery-document', document(job)).json()
    assert owner.mutate('POST', base + '/delivery-document/file', payload(saved)).status_code == 409


def test_s3_pdf_content_type(tmp_path):
    from app.storage.s3 import S3Storage
    recorded = {}
    class FakeClient:
        def put_object(self, **kwargs):
            recorded.update({**kwargs, 'Body': kwargs['Body'].read()})
    storage = S3Storage.__new__(S3Storage)
    storage.bucket = 'private-test'; storage.client = FakeClient()
    local = tmp_path / 'file.pdf'; local.write_bytes(b'%PDF-test')
    storage.put('delivery/test.pdf', local, content_type='application/pdf')
    assert recorded['ContentType'] == 'application/pdf'
    assert recorded['CacheControl'].startswith('private') and recorded['Body'] == b'%PDF-test'
