from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.hotspots.models import Hotspot
from app.modules.hotspots.schemas import HotspotInput
from app.modules.tours.service import owned_scene, owned_tour, touch


def list_hotspots(db: Session, user: User, tour_id: UUID, scene_id: UUID):
    owned_tour(db, user, tour_id)
    owned_scene(db, tour_id, scene_id)
    return list(db.scalars(select(Hotspot).where(Hotspot.scene_id == scene_id).order_by(Hotspot.created_at, Hotspot.id)))


def save_hotspot(db: Session, user: User, tour_id: UUID, scene_id: UUID, data: HotspotInput, hotspot_id: UUID | None = None):
    tour = owned_tour(db, user, tour_id, lock=True)
    owned_scene(db, tour_id, scene_id)
    hotspot = None
    if hotspot_id:
        hotspot = db.scalar(select(Hotspot).where(Hotspot.id == hotspot_id, Hotspot.scene_id == scene_id))
        if not hotspot:
            raise HTTPException(404, "Punto no encontrado")
    elif db.scalar(select(func.count()).select_from(Hotspot).where(Hotspot.scene_id == scene_id)) >= 100:
        raise HTTPException(409, "Máximo 100 puntos por ambiente")
    if data.target_scene_id:
        owned_scene(db, tour_id, data.target_scene_id)
        if data.target_scene_id == scene_id:
            raise HTTPException(422, "Elegí otro ambiente como destino")
    if hotspot:
        for key, value in data.model_dump().items():
            setattr(hotspot, key, value)
    else:
        hotspot = Hotspot(tour_id=tour_id, scene_id=scene_id, **data.model_dump())
        db.add(hotspot)
    touch(tour)
    db.commit()
    return hotspot


def delete_hotspot(db: Session, user: User, tour_id: UUID, scene_id: UUID, hotspot_id: UUID):
    tour = owned_tour(db, user, tour_id, lock=True)
    owned_scene(db, tour_id, scene_id)
    hotspot = db.scalar(select(Hotspot).where(Hotspot.id == hotspot_id, Hotspot.scene_id == scene_id))
    if not hotspot:
        raise HTTPException(404, "Punto no encontrado")
    db.delete(hotspot)
    touch(tour)
    db.commit()
