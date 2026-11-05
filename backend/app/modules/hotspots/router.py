from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.hotspots import service
from app.modules.hotspots.schemas import HotspotInput, HotspotResponse

router = APIRouter(prefix="/tours/{tour_id}/scenes/{scene_id}/hotspots", tags=["hotspots"])


@router.get("", response_model=list[HotspotResponse])
def list_hotspots(tour_id: UUID, scene_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.list_hotspots(db, user, tour_id, scene_id)


@router.post("", response_model=HotspotResponse, status_code=201, dependencies=[Depends(require_csrf)])
def create_hotspot(tour_id: UUID, scene_id: UUID, data: HotspotInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_hotspot(db, user, tour_id, scene_id, data)


@router.put("/{hotspot_id}", response_model=HotspotResponse, dependencies=[Depends(require_csrf)])
def edit_hotspot(tour_id: UUID, scene_id: UUID, hotspot_id: UUID, data: HotspotInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.save_hotspot(db, user, tour_id, scene_id, data, hotspot_id)


@router.delete("/{hotspot_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_hotspot(tour_id: UUID, scene_id: UUID, hotspot_id: UUID, db: Session = Depends(get_db), user: User = Depends(current_user)):
    service.delete_hotspot(db, user, tour_id, scene_id, hotspot_id)
