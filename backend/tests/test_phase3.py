from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import pytest

from app.modules.auth.models import AuthSession, User
from app.modules.auth.security import now, token_hash
from app.modules.tours.models import Tour
from conftest import ORIGIN


def test_production_cookies_and_settings(clients, monkeypatch):
    from fastapi.testclient import TestClient
    from pydantic import ValidationError
    from app.core.config import Settings, get_settings
    from app.main import create_app
    from app.modules.auth.security import cookie_name
    baseline = get_settings().model_dump()
    with pytest.raises(ValidationError):
        Settings(**{**baseline, "app_env": "production", "cookie_secure": False})
    with pytest.raises(ValidationError):
        Settings(**{**baseline, "cors_origins": ["*"]})
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("CORS_ORIGINS", '["https://app.example.com"]')
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_ACCESS_KEY", "test-access-key")
    monkeypatch.setenv("S3_SECRET_KEY", "test-secret-key")
    get_settings.cache_clear()
    try:
        with TestClient(create_app(), base_url="https://api.example.com") as client:
            csrf = client.get("/api/v1/auth/session").json()["csrf_token"]
            response = client.post("/api/v1/auth/register", json={"email": "secure@example.com", "password": "Test-password-123!"},
                headers={"Origin": "https://app.example.com", "X-CSRF-Token": csrf})
            assert response.status_code == 201
            for cookie in response.headers.get_list("set-cookie"):
                assert "Secure" in cookie and "HttpOnly" in cookie and "Domain=" not in cookie
            assert cookie_name("session") == "__Host-vista360_session"
            assert client.get("/api/v1/tours").status_code == 200
    finally:
        get_settings.cache_clear()


def new_tour(client, slug="casa-palermo"):
    response = client.mutate("POST", "/tours", {"title": "Casa Palermo", "slug": slug})
    assert response.status_code == 201, response.text
    return response.json()


def new_scene(client, tour, name="Living"):
    response = client.mutate("POST", f"/tours/{tour['id']}/scenes", {"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def test_registration_session_logout_and_hashes(clients, database):
    client = clients()
    response = client.register("Owner@EXAMPLE.com")
    assert response.json()["user"]["email_normalized"] == "owner@example.com"
    assert "password_hash" not in response.text and "token_hash" not in response.text
    raw = client.http.cookies["vista360_session"]
    cookie = response.headers.get_list("set-cookie")[0]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    with Session(database[0]) as db:
        user = db.scalar(select(User))
        session = db.scalar(select(AuthSession))
        assert user.password_hash.startswith("$argon2id$")
        assert session.token_hash == token_hash(raw) and session.token_hash != raw
    assert client.get("/auth/session").json()["user"] is not None
    assert client.mutate("POST", "/auth/logout").status_code == 204
    client.http.cookies.set("vista360_session", raw)
    assert client.get("/tours").status_code == 401


def test_login_duplicate_and_token_rotation(clients):
    owner = clients(); owner.register()
    other = clients()
    assert other.mutate("POST", "/auth/register", {"email": "OWNER@example.com", "password": "Test-password-123!"}).status_code == 409
    for email in ["owner@example.com", "missing@example.com"]:
        response = other.mutate("POST", "/auth/login", {"email": email, "password": "Incorrect-password"})
        assert response.status_code == 401
        assert response.json()["detail"] == "Email o contraseña incorrectos"
    old = owner.http.cookies["vista360_session"]
    assert owner.mutate("POST", "/auth/login", {"email": "owner@example.com", "password": "Test-password-123!"}).status_code == 200
    assert owner.http.cookies["vista360_session"] != old
    other.http.cookies.set("vista360_session", old)
    assert other.get("/tours").status_code == 401


def test_expired_session(clients, database):
    owner = clients(); owner.register()
    with database[0].begin() as connection:
        connection.execute(update(AuthSession).values(expires_at=now() - timedelta(seconds=1)))
    assert owner.get("/tours").status_code == 401
    assert owner.get("/auth/session").json()["user"] is None


@pytest.mark.parametrize("case", ["missing", "wrong-origin", "forged", "malformed", "session-bound"])
def test_csrf_protection(clients, case):
    owner = clients(); owner.register()
    headers = {"Origin": ORIGIN, "X-CSRF-Token": owner.csrf}
    if case == "missing": headers.pop("X-CSRF-Token")
    if case == "wrong-origin": headers["Origin"] = "https://attacker.example"
    if case in ("forged", "malformed"):
        token = "0" * 64 + "." + "0" * 64 if case == "forged" else "x" * 129
        owner.http.cookies.clear()
        owner.http.cookies.set("vista360_csrf", token)
        headers["X-CSRF-Token"] = token
    if case == "session-bound":
        other = clients(); other.register("other@example.com")
        owner.http.cookies.clear()
        owner.http.cookies.set("vista360_session", other.http.cookies["vista360_session"])
        owner.http.cookies.set("vista360_csrf", owner.csrf)
    response = owner.http.post("/api/v1/tours", json={"title": "Test", "slug": "test"}, headers=headers)
    assert response.status_code == 403


def test_no_secrets_in_validation_and_no_mass_assignment(clients):
    client = clients()
    response = client.mutate("POST", "/auth/register", {"email": "invalid", "password": "short-secret"})
    assert response.status_code == 422 and "short-secret" not in response.text
    client.register()
    response = client.mutate("POST", "/tours", {"title": "Test", "slug": "test", "owner_id": str(uuid4())})
    assert response.status_code == 422


def test_crud_order_initial_scene_and_cascade(clients, database):
    owner = clients(); owner.register()
    tour = new_tour(owner)
    a, b = new_scene(owner, tour), new_scene(owner, tour, "Cocina")
    path = f"/tours/{tour['id']}"
    assert owner.get(path).json()["start_scene_id"] == a["id"]
    result = owner.mutate("PUT", path + "/scenes/order", {"scene_ids": [b["id"], a["id"]]})
    assert result.status_code == 200
    assert [item["name"] for item in result.json()] == ["Cocina", "Living"]
    for ids in [[a["id"]], [a["id"], a["id"]], [a["id"], str(uuid4())]]:
        assert owner.mutate("PUT", path + "/scenes/order", {"scene_ids": ids}).status_code == 422
    assert owner.mutate("PUT", path + f"/scenes/{b['id']}", {"name": "Comedor", "initial_yaw": 30, "initial_pitch": -10}).status_code == 200
    assert owner.mutate("PUT", path + "/start-scene", {"scene_id": b["id"]}).status_code == 200
    assert owner.mutate("DELETE", path + f"/scenes/{b['id']}").status_code == 204
    assert owner.get(path).json()["start_scene_id"] == a["id"]
    assert owner.get(path + "/scenes").json()[0]["sort_order"] == 0
    assert owner.mutate("PUT", path, {"title": "Renombrado", "slug": "casa-nueva", "description": "Texto"}).status_code == 200
    assert owner.get(path).json()["title"] == "Renombrado"
    assert owner.mutate("DELETE", path).status_code == 204
    assert owner.get(path).status_code == 404
    with database[0].connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM scenes")).scalar_one() == 0


@pytest.mark.parametrize("method,suffix,data", [
    ("GET", "", None), ("PUT", "", {"title": "Stolen", "slug": "stolen"}), ("DELETE", "", None),
    ("GET", "/scenes", None), ("POST", "/scenes", {"name": "Foreign"}),
    ("PUT", "/scenes/order", {"scene_ids": []}),
])
def test_owner_isolation(clients, method, suffix, data):
    owner, other = clients(), clients()
    owner.register(); other.register("other@example.com")
    tour = new_tour(owner)
    path = f"/tours/{tour['id']}" + suffix
    response = other.get(path) if method == "GET" else other.mutate(method, path, data)
    assert response.status_code == 404
    assert other.get("/tours").json() == []
    assert owner.get(f"/tours/{tour['id']}").status_code == 200


def test_scene_cannot_cross_tours(clients, database):
    owner = clients(); owner.register()
    first, second = new_tour(owner), new_tour(owner, "second")
    scene = new_scene(owner, first)
    path = f"/tours/{second['id']}"
    assert owner.mutate("PUT", path + "/start-scene", {"scene_id": scene["id"]}).status_code == 404
    assert owner.mutate("PUT", path + f"/scenes/{scene['id']}", {"name": "Wrong"}).status_code == 404
    assert owner.mutate("DELETE", path + f"/scenes/{scene['id']}").status_code == 404
    with database[0].begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(update(Tour).where(Tour.id == second["id"]).values(start_scene_id=scene["id"]))


def test_concurrent_slug_and_scene_order(clients):
    first, second = clients(), clients()
    first.register(); second.register("other@example.com")
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda client: client.mutate("POST", "/tours", {"title": "Concurrent", "slug": "same-slug"}), [first, second]))
    assert sorted(response.status_code for response in responses) == [201, 409]
    owner = first if responses[0].status_code == 201 else second
    tour = responses[0].json() if responses[0].status_code == 201 else responses[1].json()
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda name: owner.mutate("POST", f"/tours/{tour['id']}/scenes", {"name": name}), ["A", "B"]))
    assert all(response.status_code == 201 for response in responses)
    assert sorted(response.json()["sort_order"] for response in responses) == [0, 1]


def test_validation_ranges_and_anonymous_access(clients):
    owner = clients()
    assert owner.get("/tours").status_code == 401
    assert owner.mutate("POST", "/tours", {"title": "Test", "slug": "test"}).status_code == 401
    owner.register()
    assert owner.mutate("POST", "/tours", {"title": " ", "slug": "Bad Slug"}).status_code == 422
    tour = new_tour(owner)
    for body in [{"name": "A", "initial_yaw": 180}, {"name": "A", "initial_pitch": 91}, {"name": "A", "initial_hfov": 20}]:
        assert owner.mutate("POST", f"/tours/{tour['id']}/scenes", body).status_code == 422


def test_cors_preflight_and_csrf_stability(clients):
    client = clients()
    assert client.get("/auth/session").json()["csrf_token"] == client.csrf
    response = client.http.options("/api/v1/tours", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-CSRF-Token,Content-Type"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert client.get("/auth/session").headers["cache-control"] == "no-store"


def test_auth_throttle(clients):
    client = clients()
    for _ in range(10):
        assert client.mutate("POST", "/auth/login", {"email": "missing@example.com", "password": "Wrong-password-123"}).status_code == 401
    assert client.mutate("POST", "/auth/login", {"email": "missing@example.com", "password": "Wrong-password-123"}).status_code == 429


def test_migration_round_trip(database, clients):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.downgrade(config, "0001_base")
    assert inspect(database[0]).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")
    command.check(config)
    assert set(inspect(database[0]).get_table_names()) == {"alembic_version", "users", "auth_sessions", "tours", "scenes", "assets", "processing_jobs", "hotspots", "tour_publications", "publication_assets", "organizations", "organization_memberships", "business_clients", "properties", "service_requests", "service_request_events", "workspaces", "auth_actions", "auth_rate_buckets", "subscriptions", "subscription_events"}
