from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.tours.models import Tour
from app.modules.tours.schemas import StartSceneInput, TourInput, TourResponse
from app.modules.tours import service
from app.modules.tours.service import owned_tour, save_tour

router = APIRouter(prefix="/tours", tags=["tours"])


@router.get("", response_model=list[TourResponse])
def list_tours(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return list(db.scalars(select(Tour).where(Tour.owner_id == user.id, Tour.organization_id.is_(None)).order_by(Tour.created_at.desc())))


@router.post("", response_model=TourResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_tour(data: TourInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return save_tour(db, user, data)


@router.get("/{tour_id}", response_model=TourResponse)
def get_tour(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return owned_tour(db, user, tour_id)


@router.put("/{tour_id}", response_model=TourResponse, dependencies=[Depends(require_csrf)])
def edit_tour(tour_id: UUID, data: TourInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return save_tour(db, user, data, tour_id)


@router.delete("/{tour_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_tour(tour_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.delete_tour(db, user, tour_id)


@router.put("/{tour_id}/start-scene", response_model=TourResponse, dependencies=[Depends(require_csrf)])
def start_scene(tour_id: UUID, data: StartSceneInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.set_start_scene(db, user, tour_id, data.scene_id)
