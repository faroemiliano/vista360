from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.modules.tours.schemas import TourInput

PropertyKind = Literal["casa", "departamento", "local", "oficina", "hotel", "otro"]


class ClientInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = Field(default=None, max_length=254)
    phone: str = Field(default="", max_length=40)


class ClientResponse(ClientInput):
    deleted_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    organization_id: UUID


class PropertyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    title: str = Field(min_length=1, max_length=200)
    kind: PropertyKind
    locality: str = Field(min_length=1, max_length=160)
    address: str = Field(default="", max_length=300)
    area_m2: float | None = Field(default=None, gt=0, le=10000000)
    rooms: int | None = Field(default=None, ge=1, le=10000)
    notes: str = Field(default="", max_length=5000)
    client_id: UUID | None = None


class PropertyResponse(PropertyInput):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    organization_id: UUID


class OrganizationTourInput(TourInput):
    property_id: UUID | None = None


class PropertyLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    property_id: UUID | None
