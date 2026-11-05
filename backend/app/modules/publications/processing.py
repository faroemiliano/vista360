from datetime import timedelta
from uuid import UUID

from sqlalchemy import select

from app.core.config import get_settings
from app.modules.assets.models import Asset
from app.modules.auth.security import now
from app.modules.publications.models import Publication
from app.modules.publications.service import release, sources
from app.modules.tours.models import Tour
from app.storage.factory import get_public_storage, get_storage


def run_publication(factory, ticket):
    from app.processing.worker import locked_job
    tour_id = UUID(ticket["details"]["tour_id"])
    publication_id = UUID(ticket["details"]["publication_id"])
    with factory() as db:
        publication = db.get(Publication, publication_id)
        planned = sources(publication) if publication else []
    for source in planned:
        with factory() as db:
            tour = db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update())
            job = locked_job(db, ticket)
            publication = db.get(Publication, publication_id)
            if not job:
                return
            if not tour or not publication or publication.status != "preparing":
                job.status = "cancelled"; db.commit(); return
            if tour.revision != publication.revision:
                release(db, publication, "failed", "revision_changed")
                job.status = "failed"; job.error_code = "revision_changed"; db.commit(); return
            asset = db.get(Asset, UUID(source["asset_id"]))
            if not asset or asset.status != "ready" or asset.type != "panorama_delivery":
                raise ValueError("Asset de publicación no disponible")
            get_public_storage(publication.storage_backend).copy_from(get_storage(asset.storage_backend), asset.storage_key, source["key"])
            job.lease_expires_at = now() + timedelta(seconds=get_settings().worker_lease_seconds)
            db.commit()
    with factory() as db:
        tour = db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update())
        job = locked_job(db, ticket)
        publication = db.get(Publication, publication_id)
        if not job:
            return
        if not tour or not publication or publication.status != "preparing":
            job.status = "cancelled"; db.commit(); return
        if tour.revision != publication.revision:
            release(db, publication, "failed", "revision_changed")
            job.status = "failed"; job.error_code = "revision_changed"; db.commit(); return
        previous = db.get(Publication, tour.published_version_id) if tour.published_version_id else None
        publication.status = "active"
        tour.published_version_id = publication.id
        tour.status = "published"; tour.slug_locked = True
        db.flush()
        if previous:
            release(db, previous, "retired")
        job.status = "succeeded"
        db.commit()
