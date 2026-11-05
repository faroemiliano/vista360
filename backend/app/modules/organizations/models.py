from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
from app.modules.workspaces.models import Workspace


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("kind IN ('agency','photographer','company','studio','individual')", name="kind_valid"),
        CheckConstraint("tour_limit > 0 AND member_limit > 0 AND storage_quota_bytes > 0", name="limits_positive"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey(Workspace.id), index=True)
    name: Mapped[str] = mapped_column(String(160))
    legal_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(50))
    locality: Mapped[str | None] = mapped_column(String(160))
    contact_name: Mapped[str | None] = mapped_column(String(160))
    address: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(String(2000))
    kind: Mapped[str] = mapped_column(String(24))
    tour_limit: Mapped[int] = mapped_column()
    member_limit: Mapped[int] = mapped_column()
    storage_quota_bytes: Mapped[int] = mapped_column(BigInteger)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Membership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (CheckConstraint("role IN ('owner','admin','editor','viewer')", name="role_valid"),)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
