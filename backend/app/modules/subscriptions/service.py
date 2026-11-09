from calendar import monthrange
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import exists, func, or_, select
from app.core.config import get_settings
from app.modules.auth.security import now
from app.modules.assets.models import Asset
from app.modules.assets.service import DELIVERY_RESERVATION
from app.modules.organizations.models import Organization
from app.modules.publications.models import Publication
from app.modules.scenes.models import Scene
from app.modules.tours.models import Tour
from app.modules.workspaces.models import Workspace
from app.modules.subscriptions.models import Subscription, SubscriptionEvent
from app.modules.subscriptions.schemas import Plan, SubscriptionView, Usage


def catalog():
    settings = get_settings()
    return {
        'legacy': Plan(code='legacy', name='Acceso anterior', published_limit=None, scene_limit=None, storage_limit_bytes=None),
        'trial': Plan(code='trial', name='Prueba', published_limit=1, scene_limit=6, storage_limit_bytes=settings.subscription_trial_storage_bytes, trial_days=14, billing_interval='trial'),
        'professional': Plan(code='professional', name='Profesional', published_limit=10, scene_limit=None, storage_limit_bytes=settings.subscription_professional_storage_bytes, billing_interval='month'),
        'studio': Plan(code='studio', name='Estudio', published_limit=30, scene_limit=None, storage_limit_bytes=settings.subscription_studio_storage_bytes, billing_interval='month'),
    }


def subscription(db, workspace, lock=False):
    # El mismo candado serializa reservas entre todos los clientes del estudio y cambios de plan.
    if lock:
        db.scalar(select(Workspace).where(Workspace.id == workspace.id).with_for_update())
    row = db.scalar(select(Subscription).where(Subscription.workspace_id == workspace.id).execution_options(populate_existing=True))
    if row is None:
        row = Subscription(workspace_id=workspace.id, plan_code='legacy', status='active', period_start=workspace.created_at, revision=0)
    return row


def tours_for(workspace):
    return select(Tour.id).outerjoin(Organization, Tour.organization_id == Organization.id).where(or_(
        Organization.workspace_id == workspace.id,
        (Tour.organization_id.is_(None)) & (Tour.owner_id == workspace.owner_id),
    ))


def usage(db, workspace):
    ids = tours_for(workspace)
    preparing = exists(select(Publication.id).where(Publication.tour_id == Tour.id, Publication.status == 'preparing'))
    published, reserved = db.execute(select(
        func.count(Tour.id).filter(Tour.published_version_id.is_not(None)),
        func.count(Tour.id).filter(Tour.published_version_id.is_(None), preparing),
    ).where(Tour.id.in_(ids))).one()
    # Reserva conservadora por original: original + derivados privados + copias públicas.
    # Incluye borradores/cargas pendientes y versiones retenidas; no mide egreso ni basura por borrar.
    storage = db.scalar(select(func.coalesce(func.sum(Asset.size_bytes + 2 * DELIVERY_RESERVATION), 0)).where(
        Asset.tour_id.in_(ids), Asset.type == 'panorama_original', Asset.status != 'rejected'))
    return Usage(published=published, preparing=reserved, storage_reserved_bytes=storage)


def trial_available(db, workspace, row):
    # Un cambio de email o volver a legacy no habilita una prueba nueva.
    if row.plan_code != 'legacy':
        return False
    previous = db.scalar(select(SubscriptionEvent.id).where(
        SubscriptionEvent.workspace_id == workspace.id,
        or_(SubscriptionEvent.before['plan_code'].as_string() != 'legacy',
            SubscriptionEvent.after['plan_code'].as_string() != 'legacy'),
    ).limit(1))
    return previous is None


def start_trial(db, actor, workspace):
    row = subscription(db, workspace, lock=True)
    if row.plan_code == 'trial':
        return view(db, workspace)  # Reintentos no reinician ni prolongan el período.
    if not trial_available(db, workspace, row):
        raise HTTPException(409, 'La prueba gratuita no está disponible para esta cuenta. Tu plan actual se conserva')
    before = snapshot(row)
    started = now()
    row.plan_code = 'trial'
    row.status = 'active'
    row.period_start = started
    row.period_end = started + timedelta(days=14)
    row.revision += 1
    db.add(row)
    db.add(SubscriptionEvent(workspace_id=workspace.id, actor_id=actor.id, action='trial_start',
        note='Prueba gratuita activada directamente por el titular', before=before, after=snapshot(row)))
    db.commit()
    return view(db, workspace)


def view(db, workspace):
    row = subscription(db, workspace)
    plans = catalog()
    return SubscriptionView(workspace_id=workspace.id, plan=plans[row.plan_code],
        status='expired' if row.period_end and row.period_end <= now() else row.status,
        period_start=row.period_start, period_end=row.period_end, revision=row.revision,
        limits_enabled=get_settings().subscription_limits_enabled, trial_available=trial_available(db, workspace, row), usage=usage(db, workspace),
        catalog=[plans[key] for key in ('trial', 'professional', 'studio')])


def owner_workspace(db, user_id):
    row = db.scalar(select(Workspace).where(Workspace.owner_id == user_id))
    if row is None:
        raise HTTPException(404, 'Estudio no encontrado')
    return row


def snapshot(row):
    return dict(plan_code=row.plan_code, status=row.status, revision=row.revision,
        period_start=row.period_start.isoformat(), period_end=row.period_end.isoformat() if row.period_end else None)


def add_months(value, months):
    year, month = divmod(value.year * 12 + value.month - 1 + months, 12)
    return value.replace(year=year, month=month + 1, day=min(value.day, monthrange(year, month + 1)[1]))


def change(db, actor, workspace, data, cancel=False):
    row = subscription(db, workspace, lock=True)
    if row.revision != data.revision:
        raise HTTPException(409, 'El plan cambió. Actualizá la ficha antes de guardar')
    before = snapshot(row)
    if cancel:
        if row.plan_code == 'legacy' or not row.period_end or row.period_end <= now():
            raise HTTPException(409, 'No hay un período vigente para cancelar')
        if row.status == 'cancelled':
            raise HTTPException(409, 'La cancelación ya está programada')
        row.status = 'cancelled'
    else:
        started = now()
        if data.plan_code == row.plan_code and row.period_end and row.period_end > started:
            started = row.period_start
            base = row.period_end
        else:
            base = started
        if data.plan_code == 'trial':
            ends = base + timedelta(days=14)
        elif data.duration_days is not None:
            ends = base + timedelta(days=data.duration_days)
        else:
            ends = add_months(base, data.duration_months or 1)
        row.plan_code = data.plan_code
        row.status = 'active'
        row.period_start = started
        row.period_end = None if data.plan_code == 'legacy' else ends
    row.revision += 1
    db.add(row)
    db.add(SubscriptionEvent(workspace_id=workspace.id, actor_id=actor.id,
        action='cancel' if cancel else 'assign', note=data.note, before=before, after=snapshot(row)))
    db.commit()
    return view(db, workspace)


def check_tour(db, tour, operation, reserve=0):
    if not get_settings().subscription_limits_enabled:
        return
    workspace = db.scalar(select(Workspace).join(Organization, Organization.workspace_id == Workspace.id).where(Organization.id == tour.organization_id)) if tour.organization_id else owner_workspace(db, tour.owner_id)
    if workspace is None:
        raise HTTPException(409, 'El recorrido no tiene un estudio asociado')
    row = subscription(db, workspace, lock=True)
    if row.plan_code == 'legacy':
        return
    if row.period_end <= now():
        raise HTTPException(403, 'El período de tu plan terminó. Contactá a Vision360 para renovarlo')
    plan = catalog()[row.plan_code]
    if operation == 'publish':
        counts = usage(db, workspace)
        if not tour.published_version_id and counts.published + counts.preparing >= plan.published_limit:
            raise HTTPException(409, 'Alcanzaste los recorridos publicados de tu plan. Despublicá uno o solicitá ampliar el plan')
        if plan.scene_limit and db.scalar(select(func.count(Scene.id)).where(Scene.tour_id == tour.id)) > plan.scene_limit:
            raise HTTPException(409, 'Este recorrido supera los ambientes permitidos por el plan de prueba')
    elif operation == 'scene' and plan.scene_limit:
        if db.scalar(select(func.count(Scene.id)).where(Scene.tour_id == tour.id)) >= plan.scene_limit:
            raise HTTPException(409, 'El plan de prueba permite hasta seis ambientes por recorrido')
    elif operation == 'upload':
        if usage(db, workspace).storage_reserved_bytes + reserve > plan.storage_limit_bytes:
            raise HTTPException(413, 'Alcanzaste la reserva de almacenamiento de tu plan. Liberá espacio o solicitá ampliarlo')
