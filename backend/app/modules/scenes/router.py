from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.scenes import service
from app.modules.scenes.schemas import SceneInput, SceneOrder, SceneResponse
from app.modules.hotspots.schemas import DeletionImpact

router = APIRouter(prefix="/tours/{tour_id}/scenes", tags=["scenes"])


@router.get("", response_model=list[SceneResponse])
def list_scenes(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.list_scenes(tour_id, db, user)


@router.post("", response_model=SceneResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_scene(tour_id: UUID, data: SceneInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.create_scene(tour_id, data, db, user)


@router.put("/order", response_model=list[SceneResponse], dependencies=[Depends(require_csrf)])
def reorder(tour_id: UUID, data: SceneOrder, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.reorder(tour_id, data, db, user)


@router.put("/{scene_id}", response_model=SceneResponse, dependencies=[Depends(require_csrf)])
def edit_scene(tour_id: UUID, scene_id: UUID, data: SceneInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.edit_scene(tour_id, scene_id, data, db, user)


@router.delete("/{scene_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_scene(tour_id: UUID, scene_id: UUID, delete_connections: bool = False, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.delete_scene(tour_id, scene_id, db, user, delete_connections)


@router.get("/{scene_id}/deletion-impact", response_model=DeletionImpact)
def deletion_impact(tour_id: UUID, scene_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.deletion_impact(tour_id, scene_id, db, user)
