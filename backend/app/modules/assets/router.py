import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.assets import service
from app.modules.assets.models import Asset
from app.modules.assets.schemas import AssetResponse, PanoramaResponse, PanoramaSource, PrepareUpload, UploadTarget
from app.modules.tours.service import owned_scene, owned_tour
from app.storage.factory import get_storage

router = APIRouter(tags=["assets"])


@router.post("/tours/{tour_id}/scenes/{scene_id}/uploads", response_model=UploadTarget, status_code=201, dependencies=[Depends(require_csrf)])
def prepare_upload(tour_id: UUID, scene_id: UUID, data: PrepareUpload, db: Session = Depends(get_db), user: User = Depends(current_user)):
    asset = service.prepare(db, user, tour_id, scene_id, data)
    remote = get_storage(asset.storage_backend).upload_url(asset.storage_key, get_settings().upload_ttl_seconds)
    return UploadTarget(asset_id=asset.id, url=remote or f"/api/v1/assets/{asset.id}/upload",
        headers={"Content-Type": "image/jpeg"}, credentials="omit" if remote else "include", expires_at=asset.upload_expires_at)


@router.put("/assets/{asset_id}/upload", status_code=204, dependencies=[Depends(require_csrf)])
async def receive_upload(asset_id: UUID, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "image/jpeg":
        raise HTTPException(415, "Sólo se admite image/jpeg")
    asset = await run_in_threadpool(service.claim_local_upload, db, user, asset_id)
    storage = get_storage("local")
    target = storage.path(asset.storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = storage.path(asset.details["local_temporary_key"])
    count, code = 0, None
    try:
        async with asyncio.timeout(get_settings().upload_ttl_seconds):
            with temporary.open("wb") as stream:
                async for block in request.stream():
                    count += len(block)
                    if count > min(get_settings().max_upload_bytes, asset.size_bytes):
                        code = "upload_too_large"; break
                    await run_in_threadpool(stream.write, block)
        if not code and count != asset.size_bytes:
            code = "size_mismatch"
        if not code:
            await run_in_threadpool(temporary.replace, target)
    except ClientDisconnect:
        code = "interrupted"
    except TimeoutError:
        code = "expired"
    except Exception:
        code = "storage_error"
    finally:
        temporary.unlink(missing_ok=True)
    try:
        await run_in_threadpool(service.local_upload_finished, db, user, asset_id, code)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    if code:
        raise HTTPException(413 if code == "upload_too_large" else 422, service.ERROR_MESSAGES[code])


@router.post("/assets/{asset_id}/complete", response_model=AssetResponse, dependencies=[Depends(require_csrf)])
def complete_upload(asset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.asset_response(service.complete(db, user, asset_id))


@router.get("/assets/{asset_id}", response_model=AssetResponse)
def asset_state(asset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.asset_response(service.owned_asset(db, user, asset_id))


@router.get("/assets/{asset_id}/content")
def content(asset_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    asset = service.owned_asset(db, user, asset_id)
    if get_settings().app_env == "production" or asset.type != "panorama_delivery" or asset.status != "ready" or asset.storage_backend != "local":
        raise HTTPException(404, "Panorama no disponible")
    path = get_storage("local").path(asset.storage_key)
    if not path.is_file():
        raise HTTPException(404, "Panorama no disponible")
    return FileResponse(path, media_type="image/jpeg", headers={"X-Content-Type-Options": "nosniff"})


@router.get("/tours/{tour_id}/scenes/{scene_id}/panorama", response_model=PanoramaResponse)
def panorama(tour_id: UUID, scene_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_tour(db, user, tour_id)
    scene = owned_scene(db, tour_id, scene_id)
    main = db.get(Asset, scene.panorama_asset_id) if scene.panorama_asset_id else None
    if not main or main.status != "ready":
        raise HTTPException(404, "El ambiente todavía no tiene una panorámica validada")
    variants = db.scalars(select(Asset).where(Asset.parent_asset_id == main.parent_asset_id,
        Asset.type == "panorama_delivery", Asset.status == "ready").order_by(Asset.width.desc()))
    sources = []
    for variant in variants:
        url = get_storage(variant.storage_backend).read_url(variant.storage_key, 600)
        sources.append(PanoramaSource(url=url or f"/api/v1/assets/{variant.id}/content",
            width=variant.width, height=variant.height, credentials="omit" if url else "include"))
    return PanoramaResponse(asset_id=main.id, sources=sources)
