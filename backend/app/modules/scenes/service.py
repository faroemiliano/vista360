from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.scenes.models import Scene
from app.modules.scenes.schemas import SceneInput, SceneOrder
from app.modules.tours.service import ordered_scenes, owned_scene, owned_tour, touch
from app.modules.hotspots.models import Hotspot


def list_scenes(tour_id: UUID, db: Session, user: User):
    owned_tour(db, user, tour_id)
    return ordered_scenes(db, tour_id)


def create_scene(tour_id: UUID, data: SceneInput, db: Session, user: User):
    tour = owned_tour(db, user, tour_id, lock=True)
    scenes = ordered_scenes(db, tour.id)
    if len(scenes) >= 1000:
        raise HTTPException(409, "Límite de 1000 ambientes por recorrido")
    scene = Scene(tour_id=tour.id, sort_order=len(scenes), **data.model_dump())
    db.add(scene)
    db.flush()
    if tour.start_scene_id is None:
        tour.start_scene_id = scene.id
    touch(tour)
    db.commit()
    return scene


def reorder(tour_id: UUID, data: SceneOrder, db: Session, user: User):
    tour = owned_tour(db, user, tour_id, lock=True)
    scenes = ordered_scenes(db, tour.id)
    if len(data.scene_ids) != len(set(data.scene_ids)) or set(data.scene_ids) != {scene.id for scene in scenes}:
        raise HTTPException(422, "El orden debe contener exactamente todos los ambientes, sin duplicados")
    positions = {scene_id: index for index, scene_id in enumerate(data.scene_ids)}
    for scene in scenes:
        scene.sort_order = positions[scene.id]
    touch(tour)
    db.commit()
    return sorted(scenes, key=lambda scene: scene.sort_order)


def edit_scene(tour_id: UUID, scene_id: UUID, data: SceneInput, db: Session, user: User):
    tour = owned_tour(db, user, tour_id, lock=True)
    scene = owned_scene(db, tour.id, scene_id)
    for key, value in data.model_dump().items():
        setattr(scene, key, value)
    touch(tour)
    db.commit()
    return scene


def deletion_impact(tour_id: UUID, scene_id: UUID, db: Session, user: User):
    owned_tour(db, user, tour_id)
    owned_scene(db, tour_id, scene_id)
    return {"incoming_connections": db.scalar(select(func.count()).select_from(Hotspot).where(Hotspot.target_scene_id == scene_id))}


def delete_scene(tour_id: UUID, scene_id: UUID, db: Session, user: User, delete_connections: bool = False):
    from app.modules.assets.service import cleanup_scene
    tour = owned_tour(db, user, tour_id, lock=True)
    scene = owned_scene(db, tour.id, scene_id)
    incoming = db.scalar(select(func.count()).select_from(Hotspot).where(Hotspot.target_scene_id == scene.id))
    if incoming and not delete_connections:
        raise HTTPException(409, f"El ambiente recibe {incoming} conexiones. Confirmá su eliminación junto con las conexiones")
    if incoming:
        db.execute(delete(Hotspot).where(Hotspot.target_scene_id == scene.id))
    cleanup_scene(db, scene)
    remaining = [item for item in ordered_scenes(db, tour.id) if item.id != scene.id]
    if tour.start_scene_id == scene.id:
        tour.start_scene_id = remaining[0].id if remaining else None
        db.flush()
    db.delete(scene)
    for index, item in enumerate(remaining):
        item.sort_order = index
    touch(tour)
    db.commit()
