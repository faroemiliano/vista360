from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)


class RequestPageInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool


class PublicStudio(BaseModel):
    name: str


class WorkspaceResponse(WorkspaceInput):
    request_token: UUID | None = None
    id: UUID
    is_owner: bool
