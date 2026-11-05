from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.modules.hotspots.schemas import HotspotInput


class PublicationCheck(BaseModel):
    revision: int
    errors: list[str]
    unreachable_scenes: list[str]


class PublishInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    confirm_unreachable: bool = False


class PublicationState(BaseModel):
    status: Literal["unpublished", "published"]
    version: int | None
    published_revision: int | None
    has_changes: bool
    preparing: bool
    error_message: str | None
    path: str


class PublicSource(BaseModel):
    url: str
    width: int
    height: int


class InitialView(BaseModel):
    yaw: float
    pitch: float
    hfov: float


class PublicHotspot(HotspotInput):
    id: UUID


class PublicScene(BaseModel):
    id: UUID
    name: str
    initial_view: InitialView
    sources: list[PublicSource]
    hotspots: list[PublicHotspot]


class PublicTour(BaseModel):
    schema_version: Literal[1]
    version: int
    title: str
    description: str
    start_scene_id: UUID
    scenes: list[PublicScene]
