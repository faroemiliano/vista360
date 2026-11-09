from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.security import now
from app.modules.subscriptions.models import Subscription, SubscriptionEvent
from app.modules.subscriptions import service
from app.modules.workspaces.models import Workspace
from app.modules.tours.models import Tour
from test_platform_accounts import administrator
from test_workspaces import owned
from test_business import organization, org_tour
from test_assets import drain, ingest, jpeg
from test_publications import ready, publish
from test_phase3 import new_scene, new_tour


def own_plan(client):
    return client.get(f"/workspaces/{owned(client)['id']}/subscription")


def test_new_trial_is_private_and_has_no_automatic_charge(clients, monkeypatch):
    owner = clients(); user = owner.register().json()['user']; workspace = owned(owner)
    response = own_plan(owner)
    assert response.status_code == 200 and response.headers['cache-control'] == 'no-store'
    plan = response.json()
    assert plan['plan']['code'] == 'trial' and plan['status'] == 'active'
    from datetime import datetime
    assert datetime.fromisoformat(plan['period_end']) - datetime.fromisoformat(plan['period_start']) == timedelta(days=14)
    assert plan['usage'] == dict(published=0, preparing=0, storage_reserved_bytes=0)
    assert plan['limits_enabled'] is False
    other = clients(); other.register('other@example.com')
    assert other.get(f"/workspaces/{workspace['id']}/subscription").status_code == 404
    org = organization(owner)
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'other@example.com', 'role': 'editor'})
    assert other.get(f"/workspaces/{workspace['id']}/subscription").status_code == 404
    path = f"/admin/accounts/{user['id']}/subscription"
    for actor in (owner, other):
        assert actor.get(path).status_code == 403
        assert actor.mutate('PUT', path, {'plan_code': 'studio', 'duration_days': 30, 'revision': 0, 'note': 'Intento propio'}).status_code == 403
        assert actor.get(path + '/events').status_code == 403
    assert clients().get(path).status_code == 401


def test_manual_assignment_renewal_cancellation_and_audit(clients, database, monkeypatch):
    owner = clients(); user = owner.register().json()['user']
    admin = clients(); administrator(admin, monkeypatch)
    path = f"/admin/accounts/{user['id']}/subscription"
    payload = dict(plan_code='professional', duration_days=30, revision=0, note='Activación acordada sin cobro automático')
    assert admin.http.put('/api/v1' + path, json=payload).status_code == 403
    result = admin.mutate('PUT', path, payload)
    assert result.status_code == 200, result.text
    first = result.json()
    assert first['revision'] == 1 and first['plan']['code'] == 'professional'
    assert own_plan(owner).json() == first
    assert admin.mutate('PUT', path, payload).status_code == 409
    renewed = admin.mutate('PUT', path, {**payload, 'revision': 1}).json()
    from datetime import datetime
    assert datetime.fromisoformat(renewed['period_end']) - datetime.fromisoformat(first['period_end']) == timedelta(days=30)
    cancelled = admin.mutate('POST', path + '/cancel', {'revision': 2, 'note': 'No renovar al vencimiento'})
    assert cancelled.status_code == 200
    assert cancelled.json()['status'] == 'cancelled' and cancelled.json()['period_end'] == renewed['period_end']
    assert admin.mutate('POST', path + '/cancel', {'revision': 3, 'note': 'Repetición'}).status_code == 409
    history = admin.get(path + '/events').json()
    assert len(history) == 3 and history[0]['action'] == 'cancel'
    assert history[0]['before']['status'] == 'active' and history[0]['after']['status'] == 'cancelled'
    assert 'Activación acordada' in history[-1]['note']
    with Session(database[0]) as db:
        row = db.get(Subscription, UUID(owned(owner)['id']))
        row.period_start = now() - timedelta(days=40); row.period_end = now() - timedelta(days=1)
        db.commit()
    assert own_plan(owner).json()['status'] == 'expired'
    assert owner.get('/workspaces').status_code == 200
    for invalid in ({**payload, 'revision': 3, 'plan_code': 'unlimited'}, {**payload, 'revision': 3, 'duration_days': 0}, {**payload, 'note': ''}, {**payload, 'price': 1}):
        assert admin.mutate('PUT', path, invalid).status_code == 422


def test_optional_limits_reserve_publication_slots_across_clients(clients, database, monkeypatch):
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', True)
    owner, first, scene = ready(clients, database)
    org = organization(owner)
    second = org_tour(owner, org)
    second_scene = new_scene(owner, second)
    ingest(owner, second, second_scene, jpeg()); drain(database)
    publish(owner, first)
    usage = own_plan(owner).json()['usage']
    assert usage['published'] == 0 and usage['preparing'] == 1
    response = owner.mutate('POST', f"/tours/{second['id']}/publish", {'revision': owner.get(f"/tours/{second['id']}").json()['revision'], 'confirm_unreachable': True})
    assert response.status_code == 409 and 'plan' in response.json()['detail']
    drain(database)
    assert own_plan(owner).json()['usage']['published'] == 1
    # Republicar el mismo recorrido conserva el lugar que ya ocupa.
    assert owner.mutate('PUT', f"/tours/{first['id']}", {'title': 'Título actualizado', 'slug': first['slug']}).status_code == 200
    publish(owner, first); drain(database)
    assert own_plan(owner).json()['usage']['published'] == 1
    assert owner.mutate('POST', f"/tours/{first['id']}/unpublish").status_code == 200
    publish(owner, second); drain(database)
    assert own_plan(owner).json()['usage']['published'] == 1


def test_expiry_keeps_existing_data_and_links_and_cancellation_keeps_period(clients, database, monkeypatch):
    owner, tour, scene = ready(clients, database)
    publish(owner, tour); drain(database)
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', True)
    workspace_id = UUID(owned(owner)['id'])
    with Session(database[0]) as db:
        row = db.get(Subscription, workspace_id); row.status = 'cancelled'; db.commit()
    # Cancelación programada aún permite uso durante el período vigente.
    assert owner.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Antes del vencimiento'}).status_code == 201
    with Session(database[0]) as db:
        row = db.get(Subscription, workspace_id)
        row.period_start = now() - timedelta(days=15); row.period_end = now() - timedelta(days=1); db.commit()
    assert own_plan(owner).json()['status'] == 'expired'
    assert owner.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Luego'}).status_code == 403
    upload = owner.mutate('POST', f"/tours/{tour['id']}/scenes/{scene['id']}/uploads", {'size_bytes': 1000, 'mime_type': 'image/jpeg'})
    assert upload.status_code == 403
    assert clients().get(f"/public/tours/{tour['slug']}").status_code == 200
    assert owner.get(f"/tours/{tour['id']}").status_code == 200
    # Durante preparación (flag desactivado) el vencimiento no bloquea cargas ni altas.
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', False)
    assert owner.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Etapa de pruebas'}).status_code == 201


def test_scene_and_storage_budgets_apply_to_the_studio_not_the_actor(clients, database, monkeypatch):
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', True)
    owner = clients(); owner.register()
    org = organization(owner); tour = org_tour(owner, org)
    scenes = [new_scene(owner, tour) for _ in range(6)]
    assert owner.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Séptimo'}).status_code == 409
    # Un colaborador con otro plan no presta su cuota al estudio del propietario.
    guest = clients(); guest.register('guest@example.com')
    owner.mutate('PUT', f"/organizations/{org['id']}/members", {'email': 'guest@example.com', 'role': 'editor'})
    assert guest.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Séptimo como editor'}).status_code == 409
    monkeypatch.setattr(get_settings(), 'subscription_trial_storage_bytes', 2 * 20 * 1024**2 + 2000)
    first = owner.mutate('POST', f"/tours/{tour['id']}/scenes/{scenes[0]['id']}/uploads", {'size_bytes': 1000, 'mime_type': 'image/jpeg'})
    assert first.status_code == 201
    second_org = organization(owner, 'Otro cliente'); second = org_tour(owner, second_org); scene = new_scene(owner, second)
    assert owner.mutate('POST', f"/tours/{second['id']}/scenes/{scene['id']}/uploads", {'size_bytes': 1000, 'mime_type': 'image/jpeg'}).status_code == 413
    assert own_plan(owner).json()['usage']['storage_reserved_bytes'] == 2 * 20 * 1024**2 + 1000


def test_concurrent_assignments_use_revision_and_keep_one_event(clients, database, monkeypatch):
    owner = clients(); user = owner.register().json()['user']
    admin = clients(); actor = administrator(admin, monkeypatch)
    from app.modules.auth.models import User
    from app.modules.subscriptions.schemas import Assignment
    from fastapi import HTTPException
    def change():
        with Session(database[0]) as db:
            try:
                service.change(db, db.get(User, UUID(actor['id'])), service.owner_workspace(db, UUID(user['id'])), Assignment(plan_code='studio', revision=0, duration_days=30, note='Asignación concurrente'))
                return 200
            except HTTPException as error:
                db.rollback(); return error.status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: change(), range(2))) == [200, 409]
    with Session(database[0]) as db:
        assert len(list(db.scalars(select(SubscriptionEvent)))) == 1


def test_concurrent_publications_cannot_exceed_one_slot_between_clients(clients, database, monkeypatch):
    owner = clients(); owner.register()
    tours = []
    for name in ('Cliente A', 'Cliente B'):
        tour = org_tour(owner, organization(owner, name)); scene = new_scene(owner, tour)
        ingest(owner, tour, scene, jpeg()); drain(database)
        tours.append(owner.get(f"/tours/{tour['id']}").json())
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', True)
    def request_publish(tour):
        return owner.mutate('POST', f"/tours/{tour['id']}/publish", {'revision': tour['revision'], 'confirm_unreachable': True}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(request_publish, tours)) == [202, 409]
    assert own_plan(owner).json()['usage']['preparing'] == 1


def test_public_catalog_matches_private_catalog_without_legacy_or_account_data(clients, monkeypatch):
    visitor = clients()
    public = visitor.get('/public/plans')
    assert public.status_code == 200
    plans = public.json()
    assert [item['code'] for item in plans] == ['trial', 'professional', 'studio']
    assert plans[0]['trial_days'] == 14 and plans[1]['published_limit'] == 10
    assert 'workspace_id' not in public.text and 'legacy' not in public.text
    owner = clients(); owner.register()
    assert own_plan(owner).json()['catalog'] == plans
    monkeypatch.setattr(get_settings(), 'subscription_trial_storage_bytes', 123456)
    assert visitor.get('/public/plans').json()[0]['storage_limit_bytes'] == 123456


def test_existing_account_can_start_free_trial_once_without_admin(clients, database):
    owner = clients(); owner.register()
    workspace = owned(owner)
    with Session(database[0]) as db:
        row = db.get(Subscription, UUID(workspace['id']))
        row.plan_code = 'legacy'; row.period_end = None; db.commit()
    before = own_plan(owner).json()
    assert before['trial_available'] is True
    path = f"/workspaces/{workspace['id']}/subscription/trial"
    assert owner.http.post('/api/v1' + path).status_code == 403
    other = clients(); other.register('other@example.com')
    assert other.mutate('POST', path).status_code == 404
    assert clients().mutate('POST', path).status_code == 401
    result = owner.mutate('POST', path)
    assert result.status_code == 200
    after = result.json()
    assert after['plan']['code'] == 'trial' and after['status'] == 'active' and after['trial_available'] is False
    assert owner.mutate('POST', path).json() == after
    with Session(database[0]) as db:
        history = list(db.scalars(select(SubscriptionEvent)))
        assert len(history) == 1 and history[0].action == 'trial_start'
        row = db.get(Subscription, UUID(workspace['id']))
        row.period_start = now() - timedelta(days=15); row.period_end = now() - timedelta(days=1); db.commit()
    expired = owner.mutate('POST', path).json()
    assert expired['status'] == 'expired' and expired['revision'] == after['revision']


def test_trial_activation_does_not_replace_paid_plan_or_restart_after_returning_to_legacy(clients, database, monkeypatch):
    owner = clients(); user = owner.register().json()['user']
    admin = clients(); administrator(admin, monkeypatch)
    path = f"/admin/accounts/{user['id']}/subscription"
    own_path = f"/workspaces/{owned(owner)['id']}/subscription/trial"
    paid = admin.mutate('PUT', path, dict(plan_code='professional', duration_days=30, revision=0, note='Plan acordado')).json()
    assert owner.mutate('POST', own_path).status_code == 409
    assert own_plan(owner).json() == paid
    restored = admin.mutate('PUT', path, dict(plan_code='legacy', duration_days=30, revision=1, note='Conservar acceso anterior')).json()
    assert restored['trial_available'] is False
    assert owner.mutate('POST', own_path).status_code == 409
    assert own_plan(owner).json() == restored


def test_concurrent_free_activation_is_idempotent(clients, database):
    owner = clients(); user = owner.register().json()['user']
    workspace_id = UUID(owned(owner)['id'])
    with Session(database[0]) as db:
        row = db.get(Subscription, workspace_id); row.plan_code = 'legacy'; row.period_end = None; db.commit()
    from app.modules.auth.models import User
    def activate():
        with Session(database[0]) as db:
            workspace = db.get(Workspace, workspace_id)
            return service.start_trial(db, db.get(User, UUID(user['id'])), workspace).model_dump()
    with ThreadPoolExecutor(max_workers=2) as pool:
        a, b = list(pool.map(lambda _: activate(), range(2)))
    assert a == b and a['revision'] == 1
    with Session(database[0]) as db:
        assert len(list(db.scalars(select(SubscriptionEvent)))) == 1


def test_trial_fits_six_high_resolution_panoramas_and_rejects_seventh_scene(clients, database, monkeypatch):
    monkeypatch.setattr(get_settings(), 'subscription_limits_enabled', True)
    owner = clients(); owner.register()
    tour = new_tour(owner)
    plan = own_plan(owner).json()['plan']
    assert plan['published_limit'] == 1 and plan['scene_limit'] == 6
    assert plan['storage_limit_bytes'] == 1024**3
    # Incluso seis originales del tamaño máximo admitido caben con sus reservas.
    assert 6 * (get_settings().max_upload_bytes + 40 * 1024**2) <= plan['storage_limit_bytes']
    photo = jpeg((4096, 2048))
    for _ in range(6):
        scene = new_scene(owner, tour)
        ingest(owner, tour, scene, photo); drain(database)
        panorama = owner.get(f"/tours/{tour['id']}/scenes/{scene['id']}/panorama").json()
        assert panorama['sources'][0]['width'] == 4096
    assert owner.mutate('POST', f"/tours/{tour['id']}/scenes", {'name': 'Séptimo'}).status_code == 409
    publish(owner, tour); drain(database)
    public = clients().get(f"/public/tours/{tour['slug']}")
    assert public.status_code == 200 and len(public.json()['scenes']) == 6
