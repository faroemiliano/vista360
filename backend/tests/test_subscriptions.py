from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID

import pytest
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


@pytest.mark.parametrize('limits_enabled', [False, True])
@pytest.mark.parametrize('client_tour', [False, True])
def test_paid_upgrade_unlocks_uploads_despite_previous_storage_caps(clients, database, monkeypatch, limits_enabled, client_tour):
    from app.modules.assets.models import Asset
    from app.modules.assets.service import DELIVERY_RESERVATION
    from app.modules.organizations.models import Organization
    photo = jpeg()
    settings = get_settings()
    old_quota = 2 * (len(photo) + DELIVERY_RESERVATION)
    monkeypatch.setattr(settings, 'subscription_limits_enabled', limits_enabled)
    monkeypatch.setattr(settings, 'subscription_trial_storage_bytes', 2 * (len(photo) + 2 * DELIVERY_RESERVATION))
    for field in ('owner_storage_quota_bytes', 'tour_storage_quota_bytes', 'organization_storage_quota_bytes'):
        monkeypatch.setattr(settings, field, old_quota)
    owner = clients(); user = owner.register().json()['user']
    org = organization(owner) if client_tour else None
    tour = org_tour(owner, org) if org else new_tour(owner)
    originals = []
    for _ in range(2):
        target = ingest(owner, tour, new_scene(owner, tour), photo)
        originals.append(target['asset_id'])
        drain(database)
    scene = new_scene(owner, tour)
    path = f"/tours/{tour['id']}/scenes/{scene['id']}/uploads"
    blocked = owner.mutate('POST', path, {'size_bytes': len(photo), 'mime_type': 'image/jpeg'})
    assert blocked.status_code == 413
    assert ('plan' if limits_enabled else 'cuota') in blocked.json()['detail']
    admin = clients(); administrator(admin, monkeypatch)
    assigned = admin.mutate('PUT', f"/admin/accounts/{user['id']}/subscription", {
        'plan_code': 'professional', 'duration_months': 1, 'revision': 0, 'note': 'Ampliar almacenamiento confirmado',
    })
    assert assigned.status_code == 200
    assert own_plan(owner).json()['plan']['storage_limit_bytes'] == 2 * 1024**3
    # No hace falta renovar de nuevo ni editar cuotas guardadas o variables.
    target = ingest(owner, tour, scene, photo)
    drain(database)
    assert owner.get(f"/assets/{target['asset_id']}").json()['status'] == 'ready'
    assert own_plan(owner).json()['usage']['storage_reserved_bytes'] == 3 * (len(photo) + 2 * DELIVERY_RESERVATION)
    with Session(database[0]) as db:
        assert all(db.get(Asset, UUID(asset_id)).status == 'ready' for asset_id in originals)
        if org:
            assert db.get(Organization, UUID(org['id'])).storage_quota_bytes == old_quota


@pytest.mark.parametrize('limits_enabled', [False, True])
def test_upgrade_uses_owner_capacity_for_collaborators_and_keeps_plan_budget(clients, database, monkeypatch, limits_enabled):
    from app.modules.assets.service import DELIVERY_RESERVATION
    photo = jpeg()
    settings = get_settings()
    technical_reserve = len(photo) + DELIVERY_RESERVATION
    plan_reserve = len(photo) + 2 * DELIVERY_RESERVATION
    monkeypatch.setattr(settings, 'subscription_limits_enabled', limits_enabled)
    monkeypatch.setattr(settings, 'subscription_trial_storage_bytes', plan_reserve)
    monkeypatch.setattr(settings, 'subscription_professional_storage_bytes', 2 * plan_reserve)
    monkeypatch.setattr(settings, 'organization_storage_quota_bytes', technical_reserve)
    monkeypatch.setattr(settings, 'tour_storage_quota_bytes', technical_reserve)
    owner = clients(); user = owner.register().json()['user']
    guest = clients(); invited = guest.register('paid-guest@example.com').json()['user']
    org = organization(owner); tour = org_tour(owner, org)
    assert owner.mutate('PUT', f"/organizations/{org['id']}/members", {
        'email': invited['email_normalized'], 'role': 'editor',
    }).status_code == 200
    ingest(owner, tour, new_scene(owner, tour), photo); drain(database)
    scene = new_scene(owner, tour)
    path = f"/tours/{tour['id']}/scenes/{scene['id']}/uploads"
    admin = clients(); administrator(admin, monkeypatch)
    def assign(account, plan):
        response = admin.mutate('PUT', f"/admin/accounts/{account['id']}/subscription", {
            'plan_code': plan, 'revision': 0, 'duration_months': 1, 'note': 'Capacidad confirmada para pruebas',
        })
        assert response.status_code == 200
    assign(invited, 'studio')
    # El plan del invitado no presta capacidad al estudio de su cliente.
    assert guest.mutate('POST', path, {'size_bytes': len(photo), 'mime_type': 'image/jpeg'}).status_code == 413
    assign(user, 'professional')
    target = ingest(guest, tour, scene, photo); drain(database)
    assert guest.get(f"/assets/{target['asset_id']}").json()['status'] == 'ready'
    assert own_plan(owner).json()['usage']['storage_reserved_bytes'] == 2 * plan_reserve
    # La capacidad se comparte entre clientes, no se multiplica por organización.
    another = org_tour(owner, organization(owner, 'Otro cliente'))
    next_scene = new_scene(owner, another)
    response = owner.mutate('POST', f"/tours/{another['id']}/scenes/{next_scene['id']}/uploads", {
        'size_bytes': len(photo), 'mime_type': 'image/jpeg',
    })
    if limits_enabled:
        assert response.status_code == 413 and 'plan' in response.json()['detail']
    else:
        assert response.status_code == 201  # El flag apagado sigue sin imponer cupos comerciales.


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
    assert plan['usage'] == dict(published=0, preparing=0, storage_reserved_bytes=0, storage_used_bytes=0)
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


def test_paid_plan_defaults_to_calendar_month_and_requires_admin(clients, monkeypatch):
    from datetime import datetime, timezone
    owner = clients(); user = owner.register().json()['user']
    admin = clients(); administrator(admin, monkeypatch)
    monkeypatch.setattr(service, 'now', lambda: datetime(2028, 1, 31, 12, tzinfo=timezone.utc))
    path = f"/admin/accounts/{user['id']}/subscription"
    payload = dict(plan_code='studio', revision=0, note='Pago personal confirmado, habilitar un mes')
    assert owner.mutate('PUT', path, payload).status_code == 403
    result = admin.mutate('PUT', path, payload)
    assert result.status_code == 200, result.text
    first = result.json()
    assert first['plan']['billing_interval'] == 'month'
    assert datetime.fromisoformat(first['period_end']) == datetime(2028, 2, 29, 12, tzinfo=timezone.utc)
    renewed = admin.mutate('PUT', path, {**payload, 'revision': 1, 'duration_months': 1})
    assert renewed.status_code == 200
    assert datetime.fromisoformat(renewed.json()['period_end']) == datetime(2028, 3, 29, 12, tzinfo=timezone.utc)
    assert admin.mutate('PUT', path, {**payload, 'revision': 2, 'duration_months': 1, 'duration_days': 30}).status_code == 422
    assert admin.mutate('PUT', path, {**payload, 'revision': 2, 'duration_months': 13}).status_code == 422
    assert service.add_months(datetime(2026, 12, 31, tzinfo=timezone.utc), 1) == datetime(2027, 1, 31, tzinfo=timezone.utc)
    assert service.add_months(datetime(2027, 1, 31, tzinfo=timezone.utc), 1) == datetime(2027, 2, 28, tzinfo=timezone.utc)


def test_remaining_days_and_reminder_seven_day_boundary(clients, database, monkeypatch):
    from datetime import datetime, timezone
    owner = clients(); owner.register()
    workspace_id = UUID(owned(owner)['id'])
    reference = datetime(2028, 5, 10, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(service, 'now', lambda: reference)
    for seconds, days, reminder in ((14 * 86400, 14, False), (7 * 86400 + 1, 8, False),
        (7 * 86400, 7, True), (6 * 86400, 6, True), (86400, 1, True), (1, 1, True), (0, 0, False), (-1, 0, False)):
        with Session(database[0]) as db:
            row = db.get(Subscription, workspace_id)
            row.plan_code = 'professional'; row.period_start = reference - timedelta(days=30)
            row.period_end = reference + timedelta(seconds=seconds)
            db.commit()
        state = own_plan(owner).json()
        assert (state['remaining_days'], state['renewal_reminder']) == (days, reminder)
    with Session(database[0]) as db:
        row = db.get(Subscription, workspace_id); row.plan_code = 'legacy'; row.period_end = None; db.commit()
    state = own_plan(owner).json()
    assert state['remaining_days'] is None and state['renewal_reminder'] is False
