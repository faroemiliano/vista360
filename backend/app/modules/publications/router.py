from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.publications import service
from app.modules.publications.models import Publication
from app.modules.publications.schemas import PublicationCheck, PublicationState, PublicTour, PublishInput
from app.modules.tours.models import Tour
from app.modules.tours.service import owned_tour
from app.storage.factory import get_public_storage

router = APIRouter(tags=["publication"])


@router.get("/tours/{tour_id}/publication", response_model=PublicationState)
def publication_state(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.state(db, owned_tour(db, user, tour_id))


@router.get("/tours/{tour_id}/publication/check", response_model=PublicationCheck)
def publication_check(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.check(db, owned_tour(db, user, tour_id))


@router.post("/tours/{tour_id}/publish", response_model=PublicationState, status_code=202, dependencies=[Depends(require_csrf)])
def publish(tour_id: UUID, data: PublishInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.prepare(db, user, tour_id, data)


@router.post("/tours/{tour_id}/unpublish", response_model=PublicationState, dependencies=[Depends(require_csrf)])
def unpublish(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.unpublish(db, user, tour_id)


@router.get("/public/tours/{slug}", response_model=PublicTour)
def public_tour(slug: str, request: Request, response: Response, db: Session = Depends(get_db)):
    publication = db.scalar(select(Publication).join(Tour, Tour.published_version_id == Publication.id)
        .where(Tour.slug == slug, Tour.status == "published", Publication.status == "active"))
    if not publication:
        raise HTTPException(404, "Recorrido no disponible")
    etag = f'"{publication.id}"'
    headers = {"ETag": etag, "Cache-Control": "public, max-age=0, must-revalidate"}
    tags = [value.strip().removeprefix("W/") for value in request.headers.get("if-none-match", "").split(",")]
    if etag in tags or "*" in tags:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    if publication.storage_backend == "s3" and not get_settings().public_media_base_url:
        raise HTTPException(503, "El dominio de medios no está configurado")
    document = publication.document
    scenes = []
    for scene in document["scenes"]:
        public_sources = []
        for source in scene["sources"]:
            url = (f"{get_settings().public_media_base_url.rstrip('/')}/{source['key']}" if publication.storage_backend == "s3"
                   else f"/api/v1/public/media/{publication.id}/{source['asset_id']}")
            public_sources.append({"url": url, "width": source["width"], "height": source["height"]})
        scenes.append({"id": scene["id"], "name": scene["name"], "initial_view": scene["initial_view"],
                       "sources": public_sources, "hotspots": scene["hotspots"]})
    return {"schema_version": 1, "version": publication.version, "title": document["title"], "description": document["description"],
            "start_scene_id": document["start_scene_id"], "scenes": scenes}


@router.get("/public/media/{publication_id}/{asset_id}")
def local_public_media(publication_id: UUID, asset_id: UUID, db: Session = Depends(get_db)):
    if get_settings().app_env == "production":
        raise HTTPException(404, "Archivo no disponible")
    publication = db.scalar(select(Publication).join(Tour, Tour.published_version_id == Publication.id)
        .where(Publication.id == publication_id, Publication.status == "active", Publication.storage_backend == "local"))
    source = next((item for item in service.sources(publication) if item["asset_id"] == str(asset_id)), None) if publication else None
    if not source:
        raise HTTPException(404, "Archivo no disponible")
    path = get_public_storage("local").path(source["key"])
    if not path.is_file():
        raise HTTPException(404, "Archivo no disponible")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
