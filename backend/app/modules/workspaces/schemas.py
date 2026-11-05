from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=160)


class WorkspaceResponse(WorkspaceInput):
    id: UUID
    is_owner: bool
