from datetime import datetime
from uuid import UUID
from urllib.parse import urlsplit
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class PublicLocation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    label: str = Field(min_length=1, max_length=2048)
    latitude: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    longitude: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)

    @field_validator("label")
    @classmethod
    def address_or_maps_url(cls, value):
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", value) or value.startswith("//"):
            try:
                url = urlsplit(value)
                host = url.hostname or ""
                google = re.fullmatch(r"(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?", host)
                valid_path = url.path == "/maps" or url.path.startswith("/maps/")
                valid = ((google and (host.startswith("maps.") or valid_path))
                         or (host == "maps.app.goo.gl" and bool(url.path.strip("/")))
                         or (host == "goo.gl" and url.path.startswith("/maps/")))
                if url.scheme != "https" or url.username or url.password or url.port is not None or not valid:
                    raise ValueError()
            except ValueError:
                raise ValueError("Pegá un enlace HTTPS de Google Maps o escribí la dirección del lugar") from None
        return value

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Completá ambas coordenadas o dejá las dos vacías")
        return self


class TourInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    description: str = Field(default="", max_length=10000)
    public_location: PublicLocation | None = None


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
