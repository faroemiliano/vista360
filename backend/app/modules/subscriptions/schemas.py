from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

PlanCode = Literal['legacy', 'trial', 'professional', 'studio']


class Plan(BaseModel):
    code: PlanCode
    name: str
    published_limit: int | None
    scene_limit: int | None
    storage_limit_bytes: int | None
    trial_days: int | None = None


class Usage(BaseModel):
    published: int
    preparing: int
    storage_reserved_bytes: int


class SubscriptionView(BaseModel):
    workspace_id: UUID
    plan: Plan
    status: Literal['active', 'cancelled', 'expired']
    period_start: datetime
    period_end: datetime | None
    revision: int
    limits_enabled: bool
    trial_available: bool
    usage: Usage
    catalog: list[Plan]


class Assignment(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    plan_code: PlanCode
    duration_days: int = Field(default=30, ge=1, le=366)
    revision: int = Field(ge=0)
    note: str = Field(min_length=3, max_length=500)


class Cancellation(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    revision: int = Field(ge=0)
    note: str = Field(min_length=3, max_length=500)


class EventView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    actor_id: UUID
    action: str
    note: str
    before: dict
    after: dict
    created_at: datetime
