from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SceneInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=120)
    initial_yaw: float = Field(default=0, ge=-180, lt=180)
    initial_pitch: float = Field(default=0, ge=-90, le=90)
    initial_hfov: float = Field(default=90, ge=50, le=110)


class SceneResponse(SceneInput):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tour_id: UUID
    sort_order: int
    content_type: str
    panorama_asset_id: UUID | None
    pending_panorama_asset_id: UUID | None
    created_at: datetime
    updated_at: datetime


class SceneOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scene_ids: list[UUID] = Field(max_length=1000)
