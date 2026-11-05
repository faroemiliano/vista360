from datetime import timedelta
from io import BytesIO
from pathlib import Path
import subprocess
from uuid import UUID

from PIL import Image
import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.modules.assets.models import Asset, ProcessingJob
from app.modules.assets.service import claim_local_upload
from app.modules.auth.models import User
from app.modules.auth.security import now
from app.processing import worker
from app.storage.factory import get_storage
from app.storage.local import LocalStorage
from conftest import ORIGIN
from test_phase3 import new_scene, new_tour


def jpeg(size=(1024, 512), color="teal", exif=False):
    stream = BytesIO()
    image = Image.new("RGB", size, color)
    metadata = Image.Exif()
    if exif:
        metadata[270] = "private-description"
    image.save(stream, "JPEG", exif=metadata)
    return stream.getvalue()


def prepare(client, tour, scene, data):
    response = client.mutate("POST", f"/tours/{tour['id']}/scenes/{scene['id']}/uploads", {
        "size_bytes": len(data), "mime_type": "image/jpeg"})
    assert response.status_code == 201, response.text
    return response.json()


def receive(client, target, data, mime="image/jpeg"):
    return client.http.put(target["url"], content=data, headers={
        "Origin": ORIGIN, "X-CSRF-Token": client.csrf, "Content-Type": mime})


def ingest(client, tour, scene, data):
    target = prepare(client, tour, scene, data)
    response = receive(client, target, data)
    assert response.status_code == 204, response.text
    response = client.mutate("POST", f"/assets/{target['asset_id']}/complete")
    assert response.status_code == 200, response.text
    return target


def drain(database):
    factory = sessionmaker(database[0], expire_on_commit=False)
    for _ in range(30):
        if not worker.run_once(factory):
            break
    return factory


def setup_owner(clients):
    owner = clients(); owner.register()
    tour = new_tour(owner)
    return owner, tour, new_scene(owner, tour)


def test_valid_upload_private_delivery_and_metadata_stripped(clients, database):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, jpeg((4096, 2048), exif=True))
    assert owner.get(f"/tours/{tour['id']}/scenes/{scene['id']}/panorama").status_code == 404
    drain(database)
    result = owner.get(f"/assets/{target['asset_id']}")
    assert result.json()["status"] == "ready"
    assert "storage_key" not in result.text
    panorama = owner.get(f"/tours/{tour['id']}/scenes/{scene['id']}/panorama").json()
    assert [(source["width"], source["height"]) for source in panorama["sources"]] == [(4096, 2048), (2048, 1024)]
    for source in panorama["sources"]:
        response = owner.http.get(source["url"])
        assert response.status_code == 200 and response.headers["content-type"] == "image/jpeg"
        with Image.open(BytesIO(response.content)) as image:
            assert not image.getexif()
    assert owner.http.get(f"/api/v1/assets/{target['asset_id']}/content").status_code == 404
    assert receive(owner, target, jpeg()).status_code == 409


@pytest.mark.parametrize("data", [b"fake-jpeg", jpeg((1024, 600)), jpeg()[:100]], ids=["not-jpeg", "wrong-ratio", "truncated"])
def test_invalid_upload_rejected_without_media(clients, database, data):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, data)
    drain(database)
    state = owner.get(f"/assets/{target['asset_id']}").json()
    assert state["status"] == "rejected" and state["error_message"]
    assert owner.get(f"/tours/{tour['id']}/scenes/{scene['id']}/panorama").status_code == 404
    assert list(Path(get_settings().storage_local_dir).rglob("*.jpg")) == []


def test_replacement_failure_keeps_previous_and_success_cleans_old(clients, database):
    owner, tour, scene = setup_owner(clients)
    original = ingest(owner, tour, scene, jpeg())
    drain(database)
    path = f"/tours/{tour['id']}/scenes/{scene['id']}/panorama"
    old = owner.get(path).json()
    bad = ingest(owner, tour, scene, b"bad image")
    drain(database)
    assert owner.get(f"/assets/{bad['asset_id']}").json()["status"] == "rejected"
    assert owner.get(path).json()["asset_id"] == old["asset_id"]
    replacement = ingest(owner, tour, scene, jpeg(color="orange"))
    drain(database)
    assert owner.get(f"/assets/{replacement['asset_id']}").json()["status"] == "ready"
    assert owner.get(path).json()["asset_id"] != old["asset_id"]
    assert owner.get(f"/assets/{original['asset_id']}").status_code == 404
    assert owner.http.get(old["sources"][0]["url"]).status_code == 404


def test_upload_size_mime_and_auth_limits(clients):
    owner, tour, scene = setup_owner(clients)
    path = f"/tours/{tour['id']}/scenes/{scene['id']}/uploads"
    assert owner.mutate("POST", path, {"size_bytes": 50 * 1024 * 1024 + 1, "mime_type": "image/jpeg"}).status_code == 413
    assert owner.mutate("POST", path, {"size_bytes": 100, "mime_type": "image/png"}).status_code == 422
    target = prepare(owner, tour, scene, b"12")
    assert receive(owner, target, b"12", "image/png").status_code == 415
    assert receive(owner, target, b"123").status_code == 413
    assert owner.get(f"/assets/{target['asset_id']}").json()["status"] == "rejected"


def test_assets_owner_isolation(clients, database):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, jpeg())
    other = clients(); other.register("other@example.com")
    assert other.get(f"/assets/{target['asset_id']}").status_code == 404
    assert other.mutate("POST", f"/assets/{target['asset_id']}/complete").status_code == 404
    assert receive(other, target, jpeg()).status_code == 404
    drain(database)
    path = f"/tours/{tour['id']}/scenes/{scene['id']}/panorama"
    assert other.get(path).status_code == 404
    source = owner.get(path).json()["sources"][0]["url"]
    assert other.http.get(source).status_code == 404
    anonymous = clients()
    assert anonymous.http.get(source).status_code == 401


def test_expired_partial_cleaned_and_idempotent_completion(clients, database):
    owner, tour, scene = setup_owner(clients)
    target = prepare(owner, tour, scene, jpeg())
    factory = sessionmaker(database[0], expire_on_commit=False)
    with factory() as db:
        user = db.scalar(select(User))
        asset = claim_local_upload(db, user, UUID(target["asset_id"]))
        temporary = get_storage("local").path(asset.details["local_temporary_key"])
        temporary.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_bytes(b"partial")
        asset.upload_expires_at = now() - timedelta(seconds=1)
        db.commit()
    worker.expire_uploads(factory)
    drain(database)
    assert not temporary.exists()
    assert owner.get(f"/assets/{target['asset_id']}").json()["error_code"] == "expired"
    good = ingest(owner, tour, scene, jpeg())
    assert owner.mutate("POST", f"/assets/{good['asset_id']}/complete").status_code == 200
    with factory() as db:
        assert len(list(db.scalars(select(ProcessingJob).where(ProcessingJob.asset_id == UUID(good["asset_id"]))))) == 1


def test_superseded_job_never_replaces_latest(clients, database):
    owner, tour, scene = setup_owner(clients)
    old = ingest(owner, tour, scene, jpeg(color="red"))
    new = ingest(owner, tour, scene, jpeg(color="blue"))
    drain(database)
    assert owner.get(f"/assets/{old['asset_id']}").json()["error_code"] == "superseded"
    assert owner.get(f"/assets/{new['asset_id']}").json()["status"] == "ready"


def test_scene_and_tour_delete_schedule_storage_cleanup(clients, database):
    owner, tour, scene = setup_owner(clients)
    ingest(owner, tour, scene, jpeg()); drain(database)
    assert owner.mutate("DELETE", f"/tours/{tour['id']}/scenes/{scene['id']}").status_code == 204
    drain(database)
    assert list(Path(get_settings().storage_local_dir).rglob("*.jpg")) == []
    scene = new_scene(owner, tour)
    ingest(owner, tour, scene, jpeg()); drain(database)
    assert owner.mutate("DELETE", f"/tours/{tour['id']}").status_code == 204
    drain(database)
    assert list(Path(get_settings().storage_local_dir).rglob("*.jpg")) == []


def test_lost_lease_cannot_finalize(clients, database):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, jpeg())
    factory = sessionmaker(database[0], expire_on_commit=False)
    first = worker.claim(factory)
    with factory() as db:
        db.execute(update(ProcessingJob).where(ProcessingJob.id == first["id"]).values(lease_expires_at=now() - timedelta(seconds=1)))
        db.commit()
    second = worker.claim(factory)
    assert first["lease"] != second["lease"]
    worker.run_validation(factory, first)
    assert owner.get(f"/assets/{target['asset_id']}").json()["status"] == "processing"
    worker.run_validation(factory, second)
    assert owner.get(f"/assets/{target['asset_id']}").json()["status"] == "ready"


def test_timeout_rejects_without_touching_scene(clients, database, monkeypatch):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, jpeg())
    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("decoder", 1)
    monkeypatch.setattr(worker.subprocess, "run", timeout)
    drain(database)
    assert owner.get(f"/assets/{target['asset_id']}").json()["error_code"] == "processing_timeout"


def test_pending_limit(clients):
    owner, tour, scene = setup_owner(clients)
    target = prepare(owner, tour, scene, jpeg())
    for index in range(2):
        other = new_scene(owner, tour, f"Scene {index}")
        prepare(owner, tour, other, jpeg())
    other = new_scene(owner, tour, "Final")
    assert owner.mutate("POST", f"/tours/{tour['id']}/scenes/{other['id']}/uploads", {"size_bytes": 100, "mime_type": "image/jpeg"}).status_code == 409


@pytest.mark.parametrize("field", ["tour_storage_quota_bytes", "owner_storage_quota_bytes"])
def test_quota_reservation_rejects_without_creating_asset(clients, database, monkeypatch, field):
    from app.modules.assets import service
    owner, tour, scene = setup_owner(clients)
    settings = get_settings().model_copy(update={field: 20 * 1024 * 1024})
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    response = owner.mutate("POST", f"/tours/{tour['id']}/scenes/{scene['id']}/uploads",
                            {"size_bytes": 100, "mime_type": "image/jpeg"})
    assert response.status_code == 413
    with Session(database[0]) as db:
        assert db.scalar(select(Asset.id)) is None


def test_storage_failure_retries_and_recovers(clients, database, monkeypatch):
    owner, tour, scene = setup_owner(clients)
    target = ingest(owner, tour, scene, jpeg())
    factory = sessionmaker(database[0], expire_on_commit=False)
    download = LocalStorage.download
    def unavailable(*args, **kwargs):
        raise OSError("temporary storage failure")
    monkeypatch.setattr(LocalStorage, "download", unavailable)
    assert worker.run_once(factory)
    with factory() as db:
        job = db.scalar(select(ProcessingJob).where(ProcessingJob.asset_id == UUID(target["asset_id"])))
        assert job.status == "queued" and job.attempts == 1
        assert job.available_at > now()
        job.available_at = now() - timedelta(seconds=1)
        db.commit()
    monkeypatch.setattr(LocalStorage, "download", download)
    drain(database)
    assert owner.get(f"/assets/{target['asset_id']}").json()["status"] == "ready"


def test_storage_path_traversal_denied(tmp_path):
    storage = LocalStorage(tmp_path / "storage")
    for key in ["../private", "/etc/passwd", "a/../../private", "%2e%2e/private"]:
        with pytest.raises(ValueError): storage.path(key)


def test_s3_signatures_and_bounded_read(monkeypatch, tmp_path):
    pytest.importorskip("boto3", reason="Instalar extra s3 para verificar el adaptador opcional")
    from pydantic import SecretStr
    from botocore.response import StreamingBody
    from botocore.stub import Stubber
    from urllib.parse import parse_qs, urlsplit
    from app.storage.s3 import S3Storage
    settings = get_settings().model_copy(update={"s3_access_key": SecretStr("test-key"),
        "s3_secret_key": SecretStr("test-secret"), "s3_endpoint_url": "https://storage.example.test"})
    storage = S3Storage(settings)
    query = parse_qs(urlsplit(storage.upload_url("uploads/id.jpg", 600)).query)
    assert query["X-Amz-Expires"] == ["600"]
    assert "content-type" in query["X-Amz-SignedHeaders"][0]
    with Stubber(storage.client) as stub:
        stub.add_response("get_object", {"Body": StreamingBody(BytesIO(b"12345"), 5)}, {"Bucket": settings.s3_bucket, "Key": "key"})
        with pytest.raises(ValueError): storage.download("key", tmp_path / "too-big.jpg", 4)
        stub.assert_no_pending_responses()
