from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.db.session import get_db
from app.modules.publications import router


@pytest.fixture
def public_client(monkeypatch):
    scene_id = str(uuid4())
    publication = SimpleNamespace(id=uuid4(), version=1, storage_backend="s3", document={
        "title": "Recorrido", "description": "", "start_scene_id": scene_id,
        "scenes": [{"id": scene_id, "name": "Living",
                    "initial_view": {"yaw": 0, "pitch": 0, "hfov": 100},
                    "sources": [{"key": "publications/photo.jpg", "asset_id": str(uuid4()),
                                 "width": 2048, "height": 1024}], "hotspots": []}],
    })
    settings = SimpleNamespace(public_media_base_url="https://supabase.example/media")
    monkeypatch.setattr(router, "get_settings", lambda: settings)
    app = FastAPI()
    app.include_router(router.router)
    app.dependency_overrides[get_db] = lambda: SimpleNamespace(scalar=lambda query: publication)
    with TestClient(app) as client:
        yield client, settings, publication


def test_provider_change_invalidates_cached_public_urls(public_client):
    client, settings, _ = public_client
    before = client.get("/public/tours/demo")
    assert before.status_code == 200
    assert before.json()["scenes"][0]["sources"][0]["url"].startswith("https://supabase.example/")
    previous_etag = before.headers["etag"]
    assert client.get("/public/tours/demo", headers={"If-None-Match": previous_etag}).status_code == 304

    settings.public_media_base_url = "https://media.example.r2.dev"
    after = client.get("/public/tours/demo", headers={"If-None-Match": previous_etag})
    assert after.status_code == 200
    assert after.headers["etag"] != previous_etag
    assert after.json()["scenes"][0]["sources"][0]["url"] == "https://media.example.r2.dev/publications/photo.jpg"
    cached = client.get("/public/tours/demo", headers={"If-None-Match": f'"older", W/{after.headers["etag"]}'})
    assert cached.status_code == 304
    assert cached.headers["cache-control"] == "public, max-age=0, must-revalidate"


@pytest.mark.parametrize("conditional", ["cached", "*"])
def test_missing_media_configuration_cannot_return_not_modified(public_client, conditional):
    client, settings, _ = public_client
    cached = client.get("/public/tours/demo")
    settings.public_media_base_url = ""
    tag = cached.headers["etag"] if conditional == "cached" else conditional
    response = client.get("/public/tours/demo", headers={"If-None-Match": tag})
    assert response.status_code == 503


def test_local_publication_cache_does_not_depend_on_external_media_domain(public_client):
    client, settings, publication = public_client
    publication.storage_backend = "local"
    before = client.get("/public/tours/demo")
    assert before.status_code == 200
    assert before.json()["scenes"][0]["sources"][0]["url"].startswith("/api/v1/public/media/")
    settings.public_media_base_url = ""
    assert client.get("/public/tours/demo", headers={"If-None-Match": before.headers["etag"]}).status_code == 304
