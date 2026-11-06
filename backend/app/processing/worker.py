from datetime import timedelta
import json
import logging
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.session import create_db_engine
from app.modules.assets.models import Asset, ProcessingJob
from app.modules.assets.service import cleanup_unreferenced_root, reject, schedule_delete
from app.modules.auth.security import now
from app.modules.scenes.models import Scene
from app.modules.tours.models import Tour
from app.modules.properties import models as property_models  # FKs del tour al ejecutar el worker sin importar la API.
from app.modules.tours.service import touch
from app.storage.factory import get_storage, get_public_storage

logger = logging.getLogger("vista360.worker")


def claim(factory) -> dict | None:
    with factory() as db:
        from app.modules.studio.notifications import configured
        query = select(ProcessingJob)
        if not configured():
            query = query.where(ProcessingJob.kind != 'notify_service')
        job = db.scalar(query.where(or_(
            (ProcessingJob.status == "queued") & (ProcessingJob.available_at <= now()),
            (ProcessingJob.status == "running") & (ProcessingJob.lease_expires_at <= now()),
        )).order_by(ProcessingJob.kind, ProcessingJob.available_at).with_for_update(skip_locked=True).limit(1))
        if not job:
            return None
        job.status = "running"
        job.attempts += 1
        job.lease_id = uuid4()
        job.lease_expires_at = now() + timedelta(seconds=get_settings().worker_lease_seconds)
        result = {"id": job.id, "asset_id": job.asset_id, "kind": job.kind, "lease": job.lease_id,
                  "attempts": job.attempts, "details": dict(job.details)}
        db.commit()
        return result


def locked_job(db: Session, claim_data: dict) -> ProcessingJob | None:
    job = db.scalar(select(ProcessingJob).where(ProcessingJob.id == claim_data["id"]).with_for_update())
    return job if job and job.lease_id == claim_data["lease"] and job.status == "running" else None


def fail(factory, ticket: dict, code: str, retry: bool = False) -> None:
    with factory() as db:
        if ticket["kind"] == "publish_tour":
            from app.modules.publications.models import Publication
            from app.modules.publications.service import release
            db.scalar(select(Tour).where(Tour.id == UUID(ticket["details"]["tour_id"])).with_for_update())
        asset = db.get(Asset, ticket["asset_id"]) if ticket["asset_id"] else None
        if asset:
            db.scalar(select(Tour).where(Tour.id == asset.tour_id).with_for_update())
        job = locked_job(db, ticket)
        if not job:
            return
        if retry and job.attempts < 3:
            job.status = "queued"
            job.available_at = now() + timedelta(seconds=10 * job.attempts)
        else:
            job.status = "failed"
            if asset:
                # No reemplaza el panorama previo si la validación/carga falla.
                reject(db, asset, code)
            if ticket["kind"] == "publish_tour":
                publication = db.get(Publication, UUID(ticket["details"]["publication_id"]))
                if publication and publication.status == "preparing":
                    release(db, publication, "failed", code)
        job.error_code = code
        db.commit()


def run_validation(factory, ticket: dict) -> None:
    with factory() as db:
        asset = db.get(Asset, ticket["asset_id"])
        if not asset or asset.status != "processing":
            job = locked_job(db, ticket)
            if job:
                job.status = "cancelled"; db.commit()
            return
        asset_id, tour_id = asset.id, asset.tour_id
        backend, upload_key, expected_size = asset.storage_backend, asset.details["upload_key"], asset.size_bytes
    storage = get_storage(backend)
    settings = get_settings()
    with TemporaryDirectory(prefix="vista360-panorama-") as directory_name:
        directory = Path(directory_name)
        source = directory / "original.jpg"
        try:
            storage.download(upload_key, source, min(expected_size, settings.max_upload_bytes))
        except ValueError:
            fail(factory, ticket, "upload_too_large"); return
        if source.stat().st_size != expected_size:
            fail(factory, ticket, "size_mismatch"); return
        options = {"source": str(source), "directory": str(directory), "limits": {
            "width": settings.max_image_width, "height": settings.max_image_height, "pixels": settings.max_image_pixels}}
        try:
            process = subprocess.run([sys.executable, "-m", "app.processing.panorama"], input=json.dumps(options),
                capture_output=True, text=True, timeout=settings.image_processing_timeout_seconds)
        except subprocess.TimeoutExpired:
            fail(factory, ticket, "processing_timeout"); return
        if process.returncode != 0:
            fail(factory, ticket, "invalid_image"); return
        result = json.loads(process.stdout)
        if "error" in result:
            fail(factory, ticket, result["error"]); return
        prefix = f"tours/{tour_id}/assets/{asset_id}/{ticket['lease']}"
        original_key = f"{prefix}/original.jpg"
        planned = [original_key] + [f"{prefix}/{variant['filename']}" for variant in result["variants"]]
        # Registrar claves antes de escribirlas: recuperación tras crash/borrado concurrente.
        with factory() as db:
            tour = db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update())
            job = locked_job(db, ticket)
            asset = db.get(Asset, asset_id)
            if not tour or not job or not asset or asset.status != "processing":
                return
            asset.details = {**asset.details, "attempt_keys": list(set(asset.details.get("attempt_keys", []) + planned))}
            db.commit()
        with factory() as db:
            tour = db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update())
            job = locked_job(db, ticket)
            asset = db.get(Asset, asset_id)
            if not tour or not job or not asset or asset.status != "processing":
                return
            scene = db.get(Scene, UUID(asset.details["scene_id"]))
            if not scene or scene.pending_panorama_asset_id != asset.id:
                reject(db, asset, "superseded"); job.status = "cancelled"; db.commit(); return
            # Sólo este tramo de escritura/finalización bloquea al tour, no la decodificación.
            storage.put(original_key, source)
            deliveries = []
            for variant in result["variants"]:
                key = f"{prefix}/{variant['filename']}"
                storage.put(key, directory / variant["filename"])
                delivery = Asset(tour_id=tour_id, parent_asset_id=asset_id, type="panorama_delivery",
                    storage_backend=backend, storage_key=key, size_bytes=variant["size"], width=variant["width"],
                    height=variant["height"], checksum_sha256=variant["checksum"], status="ready")
                db.add(delivery); deliveries.append(delivery)
            previous = db.get(Asset, scene.panorama_asset_id) if scene.panorama_asset_id else None
            asset.storage_key = original_key
            asset.width, asset.height, asset.checksum_sha256 = result["width"], result["height"], result["checksum"]
            asset.status, asset.error_code = "ready", None
            db.flush()
            scene.panorama_asset_id = deliveries[0].id
            scene.pending_panorama_asset_id = None
            touch(tour)
            job.status = "succeeded"
            db.flush()
            if previous:
                cleanup_unreferenced_root(db, previous.parent_asset_id)
            delay = asset.upload_expires_at + timedelta(seconds=30) if backend == "s3" else now()
            schedule_delete(db, backend, upload_key, delay)
            for key in asset.details["attempt_keys"]:
                if key not in planned:
                    schedule_delete(db, backend, key)
            db.commit()


def run_once(factory) -> bool:
    ticket = claim(factory)
    if not ticket:
        return False
    try:
        if ticket["attempts"] > 3:
            fail(factory, ticket, "storage_error"); return True
        if ticket["kind"] == "notify_service":
            from app.modules.studio.notifications import run
            run(factory, ticket)
        elif ticket["kind"] == "delete_file":
            storage = get_public_storage(ticket["details"]["backend"]) if ticket["details"].get("public") else get_storage(ticket["details"]["backend"])
            storage.delete(ticket["details"]["key"])
            with factory() as db:
                job = locked_job(db, ticket)
                if job:
                    job.status = "succeeded"; db.commit()
        elif ticket["kind"] == "publish_tour":
            from app.modules.publications.processing import run_publication
            run_publication(factory, ticket)
        else:
            run_validation(factory, ticket)
    except Exception:
        # No imprimir URLs firmadas, credenciales ni contenido de la imagen.
        logger.warning("job=%s error=storage_error", ticket["id"])
        fail(factory, ticket, "storage_error", retry=True)
    return True


def expire_uploads(factory) -> None:
    with factory() as db:
        candidates = list(db.execute(select(Asset.id, Asset.tour_id).where(
            Asset.status.in_(["pending", "uploading", "uploaded"]), Asset.upload_expires_at <= now()).limit(100)))
    for asset_id, tour_id in candidates:
        with factory() as db:
            db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update())
            asset = db.scalar(select(Asset).where(Asset.id == asset_id).with_for_update())
            if asset and asset.status in ("pending", "uploading", "uploaded") and asset.upload_expires_at <= now():
                reject(db, asset, "expired"); db.commit()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    engine = create_db_engine(get_settings())
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    logger.info("Worker iniciado; cola PostgreSQL; un trabajo por proceso")
    maintenance_at = 0.0
    try:
        while True:
            try:
                if time.monotonic() >= maintenance_at:
                    expire_uploads(factory)
                    maintenance_at = time.monotonic() + 30
                if not run_once(factory):
                    time.sleep(1)
            except Exception:
                logger.warning("Worker: infraestructura no disponible; reintento en 5 segundos")
                time.sleep(5)
    except KeyboardInterrupt:
        logger.info("Worker detenido")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
