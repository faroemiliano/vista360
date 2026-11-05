from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["owner", "admin", "editor", "viewer"]


class OrganizationDetails(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)
    legal_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=50)
    locality: str | None = Field(default=None, max_length=160)
    contact_name: str | None = Field(default=None, max_length=160)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator('legal_name', 'email', 'phone', 'locality', 'contact_name', 'address', 'notes', mode='before')
    @classmethod
    def blank_to_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value


class OrganizationInput(OrganizationDetails):
    kind: Literal["agency", "photographer", "company", "studio", "individual"]
    workspace_id: UUID | None = None


class OrganizationResponse(OrganizationInput):
    workspace_id: UUID
    deleted_at: datetime | None = None
    id: UUID
    role: Role
    tour_limit: int
    member_limit: int
    storage_quota_bytes: int


class MemberInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr = Field(max_length=254)
    role: Role


class MemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: Role


class AccessResponse(BaseModel):
    platform_admin: bool


class OrganizationLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tour_limit: int = Field(ge=1, le=100000)
    member_limit: int = Field(ge=1, le=10000)
    storage_quota_bytes: int = Field(ge=1, le=2**63 - 1)
