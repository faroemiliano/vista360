from datetime import timedelta
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.auth.security import now
from app.modules.assets.models import Asset, ProcessingJob
from app.modules.assets.schemas import AssetResponse, PrepareUpload
from app.modules.scenes.models import Scene
from app.modules.tours.models import Tour
from app.modules.tours.service import owned_scene, owned_tour, touch
from app.storage.factory import get_storage

DELIVERY_RESERVATION = 20 * 1024 * 1024
ERROR_MESSAGES = {
    "invalid_image": "El archivo no es un JPEG válido o está incompleto.",
    "invalid_dimensions": "La panorámica debe tener proporción 2:1 y respetar los límites de dimensiones.",
    "invalid_orientation": "Exportá el JPEG con orientación normal, sin rotación EXIF.",
    "upload_too_large": "La imagen excede el límite de tamaño permitido.",
    "size_mismatch": "El tamaño recibido no coincide con el archivo seleccionado.",
    "expired": "La carga venció. Seleccioná el archivo nuevamente.",
    "superseded": "Se inició otra carga para este ambiente.",
    "interrupted": "La carga se interrumpió. Podés volver a intentarlo.",
    "processing_timeout": "La validación excedió el tiempo permitido.",
    "storage_error": "No se pudo acceder al archivo. Volvé a intentar la carga.",
}


def asset_response(asset: Asset) -> AssetResponse:
    return AssetResponse(id=asset.id, status=asset.status, error_code=asset.error_code,
        error_message=ERROR_MESSAGES.get(asset.error_code) if asset.error_code else None,
        width=asset.width, height=asset.height)


def owned_asset(db: Session, user: User, asset_id: UUID, lock: bool = False) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(404, "Archivo no encontrado")
    owned_tour(db, user, asset.tour_id, lock=lock)
    if lock:
        asset = db.scalar(select(Asset).where(Asset.id == asset_id).with_for_update().execution_options(populate_existing=True))
        if not asset:
            raise HTTPException(404, "Archivo no encontrado")
    return asset


def schedule_delete(db: Session, backend: str, key: str, available_at=None) -> None:
    db.add(ProcessingJob(kind="delete_file", status="queued", available_at=available_at or now(),
                         details={"backend": backend, "key": key}))


def schedule_group_files(db: Session, asset: Asset) -> None:
    upload_key = asset.details.get("upload_key", asset.storage_key)
    # Un PUT firmado puede reutilizarse hasta expirar: borrar staging después de ese plazo.
    delay = (asset.upload_expires_at or now()) + timedelta(seconds=30) if asset.storage_backend == "s3" else now()
    schedule_delete(db, asset.storage_backend, upload_key, delay)
    if asset.storage_key != upload_key:
        schedule_delete(db, asset.storage_backend, asset.storage_key)
    for key in asset.details.get("attempt_keys", []):
        schedule_delete(db, asset.storage_backend, key)
    if asset.details.get("local_temporary_key"):
        schedule_delete(db, asset.storage_backend, asset.details["local_temporary_key"])
    for child in db.scalars(select(Asset).where(Asset.parent_asset_id == asset.id)):
        schedule_delete(db, child.storage_backend, child.storage_key)


def reject(db: Session, asset: Asset, code: str) -> None:
    asset.status = "rejected"
    asset.error_code = code
    for scene in db.scalars(select(Scene).where(Scene.pending_panorama_asset_id == asset.id)):
        scene.pending_panorama_asset_id = None
    schedule_group_files(db, asset)


def prepare(db: Session, user: User, tour_id: UUID, scene_id: UUID, data: PrepareUpload) -> Asset:
    settings = get_settings()
    if data.size_bytes > settings.max_upload_bytes:
        raise HTTPException(413, "Máximo 50 MiB por imagen (o el límite configurado)")
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    tour = owned_tour(db, user, tour_id, lock=True)
    scene = owned_scene(db, tour.id, scene_id)
    roots = list(db.scalars(select(Asset).join(Tour, Tour.id == Asset.tour_id).where(
        Tour.organization_id == tour.organization_id if tour.organization_id else (Tour.owner_id == user.id) & Tour.organization_id.is_(None), Asset.type == "panorama_original")))
    if sum(asset.status in ("pending", "uploading", "uploaded", "processing") for asset in roots) >= 3:
        raise HTTPException(409, "Esperá a que terminen las cargas pendientes (máximo 3)")
    if sum(asset.created_at > now() - timedelta(minutes=10) for asset in roots) >= 30:
        raise HTTPException(429, "Demasiadas cargas recientes. Intentá más tarde")
    used = lambda asset: asset.size_bytes + DELIVERY_RESERVATION if asset.status != "rejected" else 0
    reserve = data.size_bytes + DELIVERY_RESERVATION
    from app.modules.subscriptions.service import check_tour
    check_tour(db, tour, 'upload', reserve=data.size_bytes + 2 * DELIVERY_RESERVATION)
    quota = settings.owner_storage_quota_bytes
    if tour.organization_id:
        from app.modules.organizations.models import Organization
        quota = db.get(Organization, tour.organization_id).storage_quota_bytes
    if sum(used(asset) for asset in roots) + reserve > quota:
        raise HTTPException(413, "Se alcanzó la cuota de almacenamiento de la organización" if tour.organization_id else "Se alcanzó la cuota de almacenamiento del usuario")
    if sum(used(asset) for asset in roots if asset.tour_id == tour_id) + reserve > settings.tour_storage_quota_bytes:
        raise HTTPException(413, "Se alcanzó la cuota de almacenamiento del recorrido")
    asset_id = uuid4()
    key = f"uploads/{tour_id}/{asset_id}.jpg"
    asset = Asset(id=asset_id, tour_id=tour_id, type="panorama_original", storage_backend=settings.storage_backend,
        storage_key=key, size_bytes=data.size_bytes, status="pending",
        upload_expires_at=now() + timedelta(seconds=settings.upload_ttl_seconds),
        details={"scene_id": str(scene_id), "upload_key": key})
    if scene.pending_panorama_asset_id:
        previous = db.get(Asset, scene.pending_panorama_asset_id)
        if previous and previous.status != "rejected":
            reject(db, previous, "superseded")
    db.add(asset)
    db.flush()
    scene.pending_panorama_asset_id = asset.id
    touch(tour)
    db.commit()
    return asset


def claim_local_upload(db: Session, user: User, asset_id: UUID) -> Asset:
    asset = owned_asset(db, user, asset_id, lock=True)
    if asset.storage_backend != "local" or asset.status != "pending":
        raise HTTPException(409, "Esta carga ya no está disponible")
    if asset.upload_expires_at <= now():
        reject(db, asset, "expired"); db.commit()
        raise HTTPException(410, "La carga venció")
    asset.status = "uploading"
    asset.details = {**asset.details, "local_temporary_key": asset.storage_key + f".part-{uuid4().hex}"}
    db.commit()
    return asset


def local_upload_finished(db: Session, user: User, asset_id: UUID, code: str | None) -> None:
    asset = owned_asset(db, user, asset_id, lock=True)
    if asset.status != "uploading":
        # Puede haber sido reemplazada/eliminada mientras se recibía el archivo.
        schedule_delete(db, asset.storage_backend, asset.details["upload_key"])
        db.commit()
        raise HTTPException(409, "La carga fue reemplazada")
    if code:
        reject(db, asset, code)
    elif asset.upload_expires_at <= now():
        reject(db, asset, "expired")
    else:
        asset.status = "uploaded"
    db.commit()


def complete(db: Session, user: User, asset_id: UUID) -> Asset:
    asset = owned_asset(db, user, asset_id, lock=True)
    if asset.status in ("processing", "ready", "rejected"):
        return asset  # Confirmación idempotente.
    if asset.status not in ("pending", "uploaded") or (asset.storage_backend == "local" and asset.status != "uploaded"):
        raise HTTPException(409, "Todavía no terminó la carga")
    if asset.upload_expires_at <= now():
        reject(db, asset, "expired"); db.commit(); return asset
    try:
        size = get_storage(asset.storage_backend).size(asset.details["upload_key"])
    except Exception:
        raise HTTPException(409, "No se encontró el archivo recibido") from None
    if size != asset.size_bytes or size > get_settings().max_upload_bytes:
        reject(db, asset, "size_mismatch" if size != asset.size_bytes else "upload_too_large")
    else:
        asset.status = "processing"
        db.add(ProcessingJob(asset_id=asset.id, kind="validate_panorama", status="queued"))
    db.commit()
    return asset


def cleanup_unreferenced_root(db: Session, root_id: UUID) -> None:
    from app.modules.publications.models import PublicationAsset
    root = db.get(Asset, root_id)
    if not root:
        return
    group_ids = [root.id] + list(db.scalars(select(Asset.id).where(Asset.parent_asset_id == root.id)))
    referenced = db.scalar(select(Scene.id).where(
        (Scene.panorama_asset_id.in_(group_ids)) | (Scene.pending_panorama_asset_id.in_(group_ids))).limit(1))
    if referenced:
        return
    if db.scalar(select(PublicationAsset.asset_id).where(PublicationAsset.asset_id.in_(group_ids)).limit(1)):
        return
    schedule_group_files(db, root)
    db.delete(root)


def cleanup_scene(db: Session, scene: Scene) -> None:
    roots = set()
    if scene.panorama_asset_id:
        delivery = db.get(Asset, scene.panorama_asset_id)
        if delivery:
            roots.add(delivery.parent_asset_id)
    if scene.pending_panorama_asset_id:
        roots.add(scene.pending_panorama_asset_id)
    scene.panorama_asset_id = scene.pending_panorama_asset_id = None
    db.flush()
    for root in roots:
        cleanup_unreferenced_root(db, root)


def cleanup_tour(db: Session, tour_id: UUID) -> None:
    for asset in db.scalars(select(Asset).where(Asset.tour_id == tour_id, Asset.type == "panorama_original")):
        schedule_group_files(db, asset)
