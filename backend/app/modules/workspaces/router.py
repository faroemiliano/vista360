from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.modules.auth.models import User
from app.modules.auth.security import current_user, require_csrf
from app.modules.workspaces import service
from app.modules.workspaces.schemas import WorkspaceInput, WorkspaceResponse

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces", response_model=list[WorkspaceResponse])
def workspaces(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.list_workspaces(db, user)


@router.put("/workspaces/{workspace_id}", response_model=WorkspaceResponse, dependencies=[Depends(require_csrf)])
def rename(workspace_id: UUID, data: WorkspaceInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return service.rename(db, user, workspace_id, data)
