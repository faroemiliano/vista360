from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TourInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    description: str = Field(default="", max_length=10000)


class TourResponse(TourInput):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    organization_id: UUID | None
    property_id: UUID | None
    status: str
    start_scene_id: UUID | None
    published_version_id: UUID | None
    slug_locked: bool
    revision: int
    created_at: datetime
    updated_at: datetime


class StartSceneInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scene_id: UUID
