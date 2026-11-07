from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.modules.assets.models import Asset, ProcessingJob
from app.modules.auth.security import now
from app.modules.publications.models import Publication, PublicationAsset
from app.modules.publications.processing import run_publication
from app.processing import worker
from app.storage.local import LocalStorage
from app.storage.factory import get_public_storage
from test_assets import drain, ingest, jpeg, prepare as prepare_upload, setup_owner
from test_phase3 import new_scene


def ready(clients, database):
    owner, tour, scene = setup_owner(clients)
    ingest(owner, tour, scene, jpeg()); drain(database)
    return owner, owner.get(f"/tours/{tour['id']}").json(), scene


def publish(owner, tour):
    revision = owner.get(f"/tours/{tour['id']}").json()["revision"]
    result = owner.mutate("POST", f"/tours/{tour['id']}/publish", {"revision": revision, "confirm_unreachable": True})
    assert result.status_code == 202, result.text
    return result


def test_public_snapshot_anonymous_cache_and_unpublish(clients, database):
    owner, tour, scene = ready(clients, database)
    anonymous = clients()
    public = f"/public/tours/{tour['slug']}"
    assert anonymous.get(public).status_code == 404
    publish(owner, tour)
    assert anonymous.get(public).status_code == 404
    drain(database)
    result = anonymous.get(public)
    assert result.status_code == 200, result.text
    assert result.headers['cache-control'] == 'public, max-age=0, must-revalidate'
    payload = result.json()
    for secret in ['owner_id', 'email', 'checksum', 'storage_key', 'revision', 'private', 'upload_key']:
        assert secret not in result.text
    source = payload['scenes'][0]['sources'][0]['url']
    media = anonymous.http.get(source)
    assert media.status_code == 200 and media.headers['content-type'] == 'image/jpeg'
    assert 'immutable' in media.headers['cache-control']
    etag = result.headers['etag']
    assert anonymous.http.get('/api/v1' + public, headers={'If-None-Match': etag}).status_code == 304
    assert owner.get(f"/tours/{tour['id']}/publication").json()['version'] == 1
    assert owner.mutate('POST', f"/tours/{tour['id']}/unpublish").status_code == 200
    assert anonymous.http.get('/api/v1' + public, headers={'If-None-Match': etag}).status_code == 404
    assert anonymous.http.get(source).status_code == 404
    drain(database)
    assert list(get_public_storage('local').root.rglob('*.jpg')) == []


def test_draft_and_deleted_scenes_do_not_change_publication(clients, database):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); drain(database)
    public = f"/public/tours/{tour['slug']}"
    original = owner.get(public).json()
    old_source = original['scenes'][0]['sources'][0]['url']
    ingest(owner, tour, scene, jpeg(color='orange')); drain(database)
    assert owner.get(public).json() == original
    # El asset privado previo se retiene mientras el snapshot lo use.
    with sessionmaker(database[0])() as db:
        assert len(list(db.scalars(select(PublicationAsset)))) == 1
        assert len(list(db.scalars(select(Asset).where(Asset.type == 'panorama_original')))) == 2
    assert owner.mutate('DELETE', f"/tours/{tour['id']}/scenes/{scene['id']}").status_code == 204
    drain(database)
    assert owner.get(public).json() == original
    assert owner.http.get(old_source).status_code == 200
    assert owner.get(f"/tours/{tour['id']}/publication").json()['has_changes']
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish"); drain(database)
    with sessionmaker(database[0])() as db:
        assert db.scalar(select(Asset.id)) is None


def test_republish_is_versioned_and_cleans_retired_assets(clients, database):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); drain(database)
    public = f"/public/tours/{tour['slug']}"
    first = owner.get(public)
    ingest(owner, tour, scene, jpeg(color='orange')); drain(database)
    assert owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Nuevo título', 'slug': tour['slug']}).status_code == 200
    publish(owner, tour); drain(database)
    second = owner.get(public)
    assert second.json()['title'] == 'Nuevo título' and second.json()['version'] == 2
    assert second.headers['etag'] != first.headers['etag']
    assert owner.http.get(first.json()['scenes'][0]['sources'][0]['url']).status_code == 404
    with sessionmaker(database[0])() as db:
        assert len(list(db.scalars(select(Asset).where(Asset.type == 'panorama_original')))) == 1
    assert not owner.get(f"/tours/{tour['id']}/publication").json()['has_changes']
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish")
    assert owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Cambio', 'slug': 'changed-link'}).status_code == 409


def test_failed_copy_and_revision_conflict_keep_previous(clients, database, monkeypatch):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); drain(database)
    public = f"/public/tours/{tour['slug']}"
    first = owner.get(public).json()
    owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Cambio', 'slug': tour['slug']})
    publish(owner, tour)
    factory = sessionmaker(database[0], expire_on_commit=False)
    copy = LocalStorage.copy_from
    def unavailable(*args, **kwargs):
        copy(*args, **kwargs)  # Simula una copia parcial cuyo resultado no se pudo confirmar.
        raise OSError('copy unavailable')
    monkeypatch.setattr(LocalStorage, 'copy_from', unavailable)
    for attempt in range(3):
        assert worker.run_once(factory)
        with factory() as db:
            job = db.scalar(select(ProcessingJob).where(ProcessingJob.kind == 'publish_tour', ProcessingJob.status.in_(['queued', 'failed'])))
            if job.status == 'queued': job.available_at = now() - timedelta(seconds=1)
            db.commit()
    assert owner.get(public).json() == first
    assert owner.get(f"/tours/{tour['id']}/publication").json()['error_message']
    monkeypatch.setattr(LocalStorage, 'copy_from', copy)
    drain(database)
    publish(owner, tour)
    owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Cambio concurrente', 'slug': tour['slug']})
    drain(database)
    assert owner.get(public).json() == first
    assert 'cambió' in owner.get(f"/tours/{tour['id']}/publication").json()['error_message']


def test_checks_unreachable_owner_and_csrf(clients, database):
    owner, tour, scene = setup_owner(clients)
    route = f"/tours/{tour['id']}"
    assert owner.get(route + '/publication/check').json()['errors']
    assert owner.mutate('POST', route + '/publish', {'revision': 0}).status_code == 409
    publish_response = owner.mutate('POST', route + '/publish', {'revision': owner.get(route).json()['revision']})
    assert publish_response.status_code == 422
    ingest(owner, tour, scene, jpeg()); drain(database)
    other_scene = new_scene(owner, tour, 'Cocina')
    ingest(owner, tour, other_scene, jpeg()); drain(database)
    check = owner.get(route + '/publication/check').json()
    assert check['unreachable_scenes'] == ['Cocina'] and not check['errors']
    assert owner.mutate('POST', route + '/publish', {'revision': check['revision']}).status_code == 422
    other = clients(); other.register('other@example.com')
    assert other.get(route + '/publication').status_code == 404
    assert other.mutate('POST', route + '/publish', {'revision': check['revision']}).status_code == 404
    assert other.mutate('POST', route + '/unpublish').status_code == 404
    assert owner.http.post('/api/v1' + route + '/publish', json={'revision': check['revision']}).status_code == 403


def test_cancel_in_progress_delete_and_duplicate_prepare(clients, database):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); publish(owner, tour)
    factory = sessionmaker(database[0], expire_on_commit=False)
    with factory() as db:
        assert len(list(db.scalars(select(Publication)))) == 1
    ticket = worker.claim(factory)
    owner.mutate('POST', f"/tours/{tour['id']}/unpublish")
    run_publication(factory, ticket); drain(database)
    assert owner.get(f"/public/tours/{tour['slug']}").status_code == 404
    publish(owner, tour); drain(database)
    assert owner.mutate('DELETE', f"/tours/{tour['id']}").status_code == 204
    drain(database)
    assert list(Path(get_settings().storage_local_dir).rglob('*.jpg')) == []


def test_publication_lost_lease_cannot_activate(clients, database):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour)
    factory = sessionmaker(database[0], expire_on_commit=False)
    first = worker.claim(factory)
    with factory() as db:
        job = db.get(ProcessingJob, first['id']); job.lease_expires_at = now() - timedelta(seconds=1); db.commit()
    second = worker.claim(factory)
    run_publication(factory, first)
    assert owner.get(f"/public/tours/{tour['slug']}").status_code == 404
    run_publication(factory, second)
    assert owner.get(f"/public/tours/{tour['slug']}").status_code == 200


def test_duplicate_active_publish_and_new_upload_invalidate_preparation(clients, database):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); drain(database)
    publish(owner, tour); drain(database)
    factory = sessionmaker(database[0], expire_on_commit=False)
    with factory() as db:
        assert len(list(db.scalars(select(Publication)))) == 1
    owner.mutate('PUT', f"/tours/{tour['id']}", {'title': 'Nuevo borrador', 'slug': tour['slug']})
    publish(owner, tour)
    prepare_upload(owner, tour, scene, jpeg())
    drain(database)
    result = owner.get(f"/public/tours/{tour['slug']}").json()
    assert result['version'] == 1 and result['title'] == tour['title']
    assert 'cambió' in owner.get(f"/tours/{tour['id']}/publication").json()['error_message']


def test_s3_public_copy_uses_provider_and_immutable_cache():
    pytest.importorskip('boto3')
    from botocore.stub import Stubber
    from pydantic import SecretStr
    from app.storage.s3 import S3Storage
    settings = get_settings().model_copy(update={'s3_endpoint_url': 'https://storage.example.test',
        's3_access_key': SecretStr('test-key'), 's3_secret_key': SecretStr('test-secret')})
    private = S3Storage(settings)
    public = S3Storage(settings.model_copy(update={'s3_bucket': 'public-test'}))
    with Stubber(public.client) as stub:
        stub.add_response('copy_object', {'CopyObjectResult': {'ETag': '"test"'}}, {
            'Bucket': 'public-test', 'Key': 'publications/test/image.jpg',
            'CopySource': {'Bucket': settings.s3_bucket, 'Key': 'private/approved.jpg'},
            'MetadataDirective': 'REPLACE', 'ContentType': 'image/jpeg',
            'CacheControl': 'public, max-age=31536000, immutable'})
        public.copy_from(private, 'private/approved.jpg', 'publications/test/image.jpg')
        stub.assert_no_pending_responses()


def test_public_location_requires_explicit_publication_and_can_be_removed(clients, database):
    owner, tour, _ = ready(clients, database)
    path = f"/tours/{tour['id']}"
    public = f"/public/tours/{tour['slug']}"
    location = {"label": "Entrada del lugar", "latitude": -34.6037, "longitude": -58.3816}
    publish(owner, tour); drain(database)
    anonymous = clients()
    assert anonymous.get(public).json()['public_location'] is None
    payload = {"title": tour['title'], "slug": tour['slug'], "public_location": location}
    result = owner.mutate('PUT', path, payload)
    assert result.status_code == 200, result.text
    assert owner.get(path).json()['public_location'] == location
    assert anonymous.get(public).json()['public_location'] is None
    stranger = clients(); stranger.register('location-stranger@example.com')
    assert stranger.mutate('PUT', path, payload).status_code == 404
    publish(owner, tour); drain(database)
    assert anonymous.get(public).json()['public_location'] == location
    assert owner.mutate('PUT', path, {**payload, 'public_location': None}).status_code == 200
    assert anonymous.get(public).json()['public_location'] == location
    publish(owner, tour); drain(database)
    assert anonymous.get(public).json()['public_location'] is None


def test_location_rejects_incomplete_out_of_range_and_unknown_fields(clients, database):
    owner, tour, _ = ready(clients, database)
    path = f"/tours/{tour['id']}"
    location = {"label": "Entrada", "latitude": -34.6, "longitude": -58.3}
    invalid = [{**location, 'latitude': 91}, {**location, 'longitude': -181},
               {**location, 'label': ' '}, {'label': 'Entrada', 'latitude': 0},
               {**location, 'url': 'javascript:alert(1)'}]
    revision = owner.get(path).json()['revision']
    for value in invalid:
        assert owner.mutate('PUT', path, {'title': tour['title'], 'slug': tour['slug'], 'public_location': value}).status_code == 422
    assert owner.get(path).json()['revision'] == revision
