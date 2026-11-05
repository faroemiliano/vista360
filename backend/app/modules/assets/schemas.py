from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PrepareUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    size_bytes: int = Field(gt=0)
    mime_type: Literal["image/jpeg"]


class UploadTarget(BaseModel):
    asset_id: UUID
    url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str]
    credentials: Literal["include", "omit"]
    expires_at: datetime


class AssetResponse(BaseModel):
    id: UUID
    status: str
    error_code: str | None
    error_message: str | None
    width: int | None
    height: int | None


class PanoramaSource(BaseModel):
    url: str
    width: int
    height: int
    credentials: Literal["include", "omit"]


class PanoramaResponse(BaseModel):
    asset_id: UUID
    sources: list[PanoramaSource]
