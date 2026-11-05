from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class InfoContent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=2000)


class HotspotInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    type: Literal["navigation", "info"]
    yaw: float = Field(ge=-180, lt=180)
    pitch: float = Field(ge=-90, le=90)
    label: str = Field(min_length=1, max_length=120)
    target_scene_id: UUID | None = None
    content: InfoContent | None = None

    @model_validator(mode="after")
    def payload(self):
        if self.type == "navigation" and (self.target_scene_id is None or self.content is not None):
            raise ValueError("Una conexión requiere destino y no admite contenido informativo")
        if self.type == "info" and (self.target_scene_id is not None or self.content is None):
            raise ValueError("Un punto informativo requiere texto y no admite destino")
        return self


class HotspotResponse(HotspotInput):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tour_id: UUID
    scene_id: UUID
    created_at: datetime
    updated_at: datetime


class DeletionImpact(BaseModel):
    incoming_connections: int
