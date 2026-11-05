from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.auth.security import now
from app.modules.scenes.models import Scene
from app.modules.tours.models import Tour
from app.modules.tours.schemas import TourInput
from app.modules.organizations.service import organization_access


def owned_tour(db: Session, user: User, tour_id: UUID, lock: bool = False) -> Tour:
    tour = db.get(Tour, tour_id)
    if tour and tour.organization_id:
        organization_access(db, user, tour.organization_id, write=lock, lock=lock)
    elif not tour or tour.owner_id != user.id:
        raise HTTPException(404, "Recorrido no encontrado")
    if lock:
        tour = db.scalar(select(Tour).where(Tour.id == tour_id).with_for_update().execution_options(populate_existing=True))
    if not tour:
        raise HTTPException(404, "Recorrido no encontrado")
    return tour


def touch(tour: Tour):
    tour.revision += 1
    tour.updated_at = now()


def save_tour(db: Session, user: User, data: TourInput, tour_id: UUID | None = None, organization_id: UUID | None = None, property_id: UUID | None = None) -> Tour:
    tour = owned_tour(db, user, tour_id, lock=True) if tour_id else Tour(owner_id=user.id, organization_id=organization_id, property_id=property_id, **data.model_dump())
    if tour_id:
        if tour.slug_locked and data.slug != tour.slug:
            raise HTTPException(409, "El slug queda fijo después de publicar para conservar el enlace")
        for key, value in data.model_dump().items():
            setattr(tour, key, value)
        touch(tour)
    db.add(tour)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "El slug ya está en uso") from None
    return tour


def ordered_scenes(db: Session, tour_id: UUID) -> list[Scene]:
    return list(db.scalars(select(Scene).where(Scene.tour_id == tour_id).order_by(Scene.sort_order)))


def owned_scene(db: Session, tour_id: UUID, scene_id: UUID) -> Scene:
    scene = db.scalar(select(Scene).where(Scene.id == scene_id, Scene.tour_id == tour_id))
    if not scene:
        raise HTTPException(404, "Ambiente no encontrado")
    return scene


def delete_tour(db: Session, user: User, tour_id: UUID) -> None:
    from app.modules.assets.service import cleanup_tour
    from app.modules.hotspots.models import Hotspot
    from app.modules.publications.service import cleanup_tour as cleanup_publications
    tour = owned_tour(db, user, tour_id, lock=True)
    from app.modules.studio.models import ServiceRequest
    if db.scalar(select(ServiceRequest.id).where(ServiceRequest.tour_id == tour.id)):
        raise HTTPException(409, "Este recorrido pertenece a un trabajo y se conserva con su historial")
    cleanup_publications(db, tour)
    cleanup_tour(db, tour.id)
    db.execute(delete(Hotspot).where(Hotspot.tour_id == tour.id))
    tour.start_scene_id = None
    db.flush()
    db.delete(tour)
    db.commit()


def set_start_scene(db: Session, user: User, tour_id: UUID, scene_id: UUID) -> Tour:
    tour = owned_tour(db, user, tour_id, lock=True)
    owned_scene(db, tour.id, scene_id)
    tour.start_scene_id = scene_id
    touch(tour)
    db.commit()
    return tour
