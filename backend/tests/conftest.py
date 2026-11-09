from contextlib import ExitStack
import os
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import psycopg
from psycopg import sql
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.core.config import get_settings
from app.main import create_app

ORIGIN = "http://localhost:5174"


class PrivateDatabaseUrl(str):
    """Evita credenciales en el repr automático de fixtures de pytest."""
    def __repr__(self):
        return "'<private PostgreSQL test URL>'"


@pytest.fixture(scope="session")
def database():
    """DB propia efímera: nunca vacía ni migra la base de desarrollo."""
    original = get_settings().database_url.get_secret_value()
    url = make_url(original)
    if url.host not in ("localhost", "127.0.0.1"):
        raise RuntimeError("Las pruebas requieren PostgreSQL local")
    name = f"vista360_{uuid4().hex[:12]}_test"
    try:
        admin = psycopg.connect(url.set(drivername="postgresql", database="postgres").render_as_string(hide_password=False), autocommit=True)
    except psycopg.OperationalError:
        # No dejar que el traceback del driver imprima la URL con credenciales.
        raise RuntimeError("PostgreSQL local no está disponible. Ejecutá docker compose up -d --wait db.") from None
    admin.execute(sql.SQL("CREATE DATABASE {}" ).format(sql.Identifier(name)))
    test_url = url.set(database=name).render_as_string(hide_password=False)
    previous = os.environ.get("DATABASE_URL")
    previous_storage = os.environ.get("STORAGE_LOCAL_DIR")
    storage_directory = TemporaryDirectory(prefix="vista360-test-storage-")
    os.environ["STORAGE_LOCAL_DIR"] = storage_directory.name
    os.environ["DATABASE_URL"] = test_url
    get_settings.cache_clear()
    engine = create_engine(test_url)
    try:
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        command.upgrade(config, "head")
        yield engine, PrivateDatabaseUrl(test_url)
    finally:
        engine.dispose()
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous
        get_settings.cache_clear()
        if previous_storage is None:
            os.environ.pop("STORAGE_LOCAL_DIR", None)
        else:
            os.environ["STORAGE_LOCAL_DIR"] = previous_storage
        storage_directory.cleanup()
        admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.close()


class Client:
    def __init__(self, client: TestClient):
        self.http = client
        self.csrf = client.get("/api/v1/auth/session").json()["csrf_token"]

    def get(self, path):
        return self.http.get(f"/api/v1{path}")

    def mutate(self, method, path, data=None):
        response = self.http.request(method, f"/api/v1{path}", json=data,
            headers={"Origin": ORIGIN, "X-CSRF-Token": self.csrf})
        if response.status_code in (200, 201) and path in ("/auth/login", "/auth/register"):
            self.csrf = response.json()["csrf_token"]
        return response

    def register(self, email="owner@example.com"):
        response = self.mutate("POST", "/auth/register", {"email": email, "password": "Test-password-123!"})
        assert response.status_code == 201, response.text
        return response


@pytest.fixture
def clients(database):
    engine, _ = database
    storage_root = Path(os.environ["STORAGE_LOCAL_DIR"])
    assert storage_root.name.startswith("vista360-test-storage-")
    shutil.rmtree(storage_root)
    storage_root.mkdir()
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE auth_rate_buckets, users, auth_sessions, tours, scenes, assets, processing_jobs, hotspots, tour_publications, publication_assets, organizations, organization_memberships, business_clients, properties, service_requests, service_request_events CASCADE"))
    with ExitStack() as stack:
        def factory():
            client = stack.enter_context(TestClient(create_app()))
            return Client(client)
        yield factory
