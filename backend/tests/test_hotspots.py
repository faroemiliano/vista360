from uuid import UUID

import pytest
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

from app.modules.hotspots.models import Hotspot
from app.modules.tours.models import Tour
from test_phase3 import new_scene, new_tour


def setup(clients):
    owner = clients(); owner.register()
    tour = new_tour(owner)
    a, b = new_scene(owner, tour, "Living"), new_scene(owner, tour, "Cocina")
    return owner, tour, a, b


def path(tour, scene):
    return f"/tours/{tour['id']}/scenes/{scene['id']}/hotspots"


def navigation(target, label="Ir a Cocina"):
    return {"type": "navigation", "label": label, "yaw": 20, "pitch": -5, "target_scene_id": target["id"]}


def test_hotspot_crud_revision_direction_and_persistence(clients, database):
    owner, tour, a, b = setup(clients)
    base = path(tour, a)
    revision = owner.get(f"/tours/{tour['id']}").json()["revision"]
    response = owner.mutate("POST", base, navigation(b))
    assert response.status_code == 201, response.text
    point = response.json()
    assert owner.get(base).json()[0]["id"] == point["id"]
    assert owner.get(path(tour, b)).json() == []
    assert owner.get(f"/tours/{tour['id']}").json()["revision"] == revision + 1
    info = {"type": "info", "label": "Detalles", "yaw": -10, "pitch": 2, "content": {"text": "<b>Texto plano</b>"}}
    response = owner.mutate("PUT", base + f"/{point['id']}", info)
    assert response.status_code == 200 and response.json()["target_scene_id"] is None
    assert owner.get(base).json()[0]["content"] == info["content"]
    with database[0].connect() as connection:
        assert connection.execute(select(Hotspot.content)).scalar_one() == info["content"]
    assert owner.mutate("DELETE", base + f"/{point['id']}").status_code == 204
    assert owner.get(base).json() == []


def test_hotspot_owner_csrf_and_cross_tour_integrity(clients, database):
    owner, tour, a, b = setup(clients)
    other = clients(); other.register("other@example.com")
    base = path(tour, a)
    point = owner.mutate("POST", base, navigation(b)).json()
    assert other.get(base).status_code == 404
    assert other.mutate("POST", base, navigation(b)).status_code == 404
    assert other.mutate("PUT", base + f"/{point['id']}", navigation(b)).status_code == 404
    assert other.mutate("DELETE", base + f"/{point['id']}").status_code == 404
    assert other.get(f"/tours/{tour['id']}/scenes/{a['id']}/deletion-impact").status_code == 404
    assert owner.http.post('/api/v1' + base, json=navigation(b)).status_code == 403
    assert clients().get(base).status_code == 401
    foreign_tour = new_tour(owner, "second")
    foreign = new_scene(owner, foreign_tour)
    assert owner.mutate("POST", base, navigation(foreign)).status_code == 404
    assert owner.mutate("PUT", path(tour, b) + f"/{point['id']}", navigation(a)).status_code == 404
    with database[0].begin() as connection:
        with pytest.raises(IntegrityError):
            connection.execute(insert(Hotspot).values(tour_id=UUID(tour['id']), scene_id=UUID(a['id']),
                target_scene_id=UUID(foreign['id']), type="navigation", label="Cross", yaw=0, pitch=0))


@pytest.mark.parametrize("body", [
    {"type": "info", "label": "A", "yaw": 0, "pitch": 0},
    {"type": "navigation", "label": "A", "yaw": 0, "pitch": 0},
    {"type": "info", "label": "A", "yaw": 180, "pitch": 0, "content": {"text": "x"}},
    {"type": "info", "label": "A", "yaw": 0, "pitch": 91, "content": {"text": "x"}},
    {"type": "info", "label": " ", "yaw": 0, "pitch": 0, "content": {"text": "x"}},
    {"type": "info", "label": "A", "yaw": 0, "pitch": 0, "content": {"text": "x", "html": "x"}},
    {"type": "info", "label": "A", "yaw": 0, "pitch": 0, "content": {"text": "x" * 2001}},
])
def test_hotspot_validation(clients, body):
    owner, tour, a, b = setup(clients)
    assert owner.mutate("POST", path(tour, a), body).status_code == 422


def test_scene_delete_requires_explicit_connection_confirmation(clients):
    owner, tour, a, b = setup(clients)
    owner.mutate("POST", path(tour, a), navigation(b))
    owner.mutate("POST", path(tour, b), navigation(a, "Volver al Living"))
    route = f"/tours/{tour['id']}/scenes/{b['id']}"
    assert owner.get(route + "/deletion-impact").json() == {"incoming_connections": 1}
    assert owner.mutate("DELETE", route).status_code == 409
    assert len(owner.get(path(tour, a)).json()) == 1
    assert owner.mutate("DELETE", route + "?delete_connections=true").status_code == 204
    assert owner.get(path(tour, a)).json() == []


def test_deleting_connected_tour_and_self_target(clients, database):
    owner, tour, a, b = setup(clients)
    assert owner.mutate("POST", path(tour, a), navigation(a)).status_code == 422
    for source, target in [(a, b), (b, a)]:
        assert owner.mutate("POST", path(tour, source), navigation(target)).status_code == 201
    assert owner.mutate("DELETE", f"/tours/{tour['id']}").status_code == 204
    with database[0].connect() as connection:
        assert connection.execute(select(Hotspot.id)).first() is None
