import re
from datetime import datetime
from typing import Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from app.modules.properties.schemas import PropertyKind

Status = Literal["SOLICITADO", "PRESUPUESTADO", "CONFIRMADO", "EN_PRODUCCION", "EN_REVISION", "PUBLICADO", "FINALIZADO", "CANCELADO"]


class ServiceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)
    submission_id: UUID
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr = Field(max_length=254)
    whatsapp: str = Field(min_length=7, max_length=40)
    property_kind: PropertyKind
    locality: str = Field(min_length=2, max_length=160)
    area_m2: float = Field(gt=0, le=10000000)
    rooms: int = Field(ge=1, le=10000)
    message: str = Field(default="", max_length=5000)
    consent: Literal[True]
    website: str = Field(default="", max_length=0)

    @field_validator("whatsapp")
    @classmethod
    def phone(cls, value):
        value = re.sub(r"[\s().-]", "", value)
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Ingresá un número de WhatsApp válido, incluyendo código de país")
        return value


class ServiceReceipt(BaseModel):
    id: UUID
    status: Literal["SOLICITADO"] = "SOLICITADO"
    message: str = "Solicitud recibida. Conservá tu número de referencia."


class ServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    email: str
    whatsapp: str
    property_kind: str
    locality: str
    area_m2: float
    rooms: int
    message: str
    status: Status
    created_at: datetime
    updated_at: datetime
    organization_id: UUID | None
    tour_id: UUID | None


class TransitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_status: Status
    status: Status
    note: str = Field(default="", max_length=2000)


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    actor_id: UUID
    previous_status: str
    status: str
    note: str
    created_at: datetime


class WorkLinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    client_id: UUID | None = None
    property_id: UUID | None = None
    tour_id: UUID | None = None


class AssignWorkInput(WorkLinkInput):
    organization_id: UUID


class WorkCreate(ServiceInput, WorkLinkInput):
    submission_id: UUID = Field(default_factory=uuid4)
    consent: Literal[True] = True


class WorkDetails(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0)
    scheduled_at: datetime | None = None
    operations_notes: str = Field(default="", max_length=5000)

    @field_validator("scheduled_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("La fecha debe incluir zona horaria")
        return value


class DeliveryInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expected_revision: int = Field(ge=0)
    note: str = Field(min_length=1, max_length=2000)


class WorkResponse(ServiceResponse):
    title: str
    client_id: UUID | None
    client_name: str | None
    client_deleted: bool = False
    property_id: UUID | None
    scheduled_at: datetime | None
    operations_notes: str
    delivered_at: datetime | None
    delivered_version_id: UUID | None
    work_revision: int
    public_path: str | None
    has_unpublished_changes: bool
