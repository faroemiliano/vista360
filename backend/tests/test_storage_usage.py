from app.core.config import get_settings
from test_assets import drain, ingest, jpeg, prepare
from test_business import organization, org_tour
from test_delivery_files import prepared, payload
from test_phase3 import new_scene, new_tour
from test_platform_accounts import administrator
from test_workspaces import owned


def report(client, **params):
    return client.http.get(f"/api/v1/workspaces/{owned(client)['id']}/storage", params=params)


def test_storage_counts_saved_files_public_copies_pdf_and_releases(clients, database):
    owner = clients(); owner.register()
    org = organization(owner)
    base, job, tour = prepared(owner, org, database)
    created = owner.mutate('POST', base + '/delivery-document/file', payload(job))
    assert created.status_code == 200
    pdf_bytes = created.json()['delivery_file']['size_bytes']
    drain(database)
    root = get_settings().storage_local_dir
    public_bytes = sum(p.stat().st_size for p in (root / '_public').rglob('*') if p.is_file())
    all_bytes = sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
    body = report(owner).json()
    assert body['totals']['used_bytes'] == all_bytes
    assert body['totals']['public_bytes'] == public_bytes > 0
    assert body['totals']['pdf_bytes'] == pdf_bytes > 0
    assert body['totals']['original_bytes'] > 0 and body['totals']['derived_bytes'] > 0
    assert body['projects'][0]['tour_id'] == tour['id']
    assert body['projects'][0]['used_bytes'] == all_bytes
    subscription = owner.get(f"/workspaces/{owned(owner)['id']}/subscription").json()
    assert subscription['usage']['storage_used_bytes'] == all_bytes
    assert subscription['usage']['storage_reserved_bytes'] > all_bytes
    assert owner.mutate('POST', f"/tours/{tour['id']}/unpublish").status_code == 200
    drain(database)
    assert report(owner).json()['totals']['used_bytes'] == all_bytes - public_bytes
    assert report(owner).json()['totals']['public_bytes'] == 0


def test_storage_is_charged_to_client_studio_not_invited_creator(clients, database, monkeypatch):
    owner = clients(); owner.register()
    guest = clients(); guest.register('guest-storage@example.com')
    org = organization(owner)
    assert owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'guest-storage@example.com', 'role': 'editor'}).status_code == 200
    tour = org_tour(guest, org)
    ingest(guest, tour, new_scene(guest, tour), jpeg()); drain(database)
    amount = report(owner).json()['totals']['used_bytes']
    assert amount > 0
    assert report(guest).json()['totals']['used_bytes'] == 0
    path = f"/workspaces/{owned(owner)['id']}/storage"
    assert guest.get(path).status_code == 404
    assert clients().get(path).status_code == 401
    admin = clients(); administrator(admin, monkeypatch)
    directory = admin.get('/admin/accounts').json()['items']
    counts = {row['email']: row['storage_used_bytes'] for row in directory}
    assert counts['owner@example.com'] == amount
    assert counts['guest-storage@example.com'] == 0
    assert admin.get(path).status_code == 404  # El detalle propio conserva el permiso de titular.


def test_storage_pending_uploads_empty_projects_and_pagination(clients, database):
    owner = clients(); owner.register()
    assert report(owner).json()['total'] == 0
    tour = new_tour(owner)
    scene = new_scene(owner, tour)
    prepare(owner, tour, scene, jpeg())
    body = report(owner).json()
    assert body['totals']['used_bytes'] == 0
    assert body['projects'][0]['used_bytes'] == 0
    new_tour(owner, slug='otro-proyecto-consumo')
    first = report(owner, limit=1).json()
    second = report(owner, limit=1, offset=1).json()
    assert first['total'] == second['total'] == 2
    assert first['projects'][0]['tour_id'] != second['projects'][0]['tour_id']
    assert report(owner, offset=100).json()['projects'] == []
    for params in ({'limit': 0}, {'limit': 101}, {'offset': -1}):
        assert report(owner, **params).status_code == 422
