from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base

STATES = "'SOLICITADO','PRESUPUESTADO','CONFIRMADO','EN_PRODUCCION','EN_REVISION','PUBLICADO','FINALIZADO','CANCELADO'"


class ServiceRequest(Base):
    __tablename__ = "service_requests"
    __table_args__ = (
        CheckConstraint(f"status IN ({STATES})", name="status_valid"),
        CheckConstraint("area_m2 > 0 AND area_m2 <= 10000000 AND rooms BETWEEN 1 AND 10000", name="size_valid"),
        ForeignKeyConstraint(["tour_id", "organization_id"], ["tours.id", "tours.organization_id"], name="fk_service_work_tour"),
        CheckConstraint("(organization_id IS NULL) = (tour_id IS NULL)", name="work_assignment"),
        CheckConstraint("work_revision >= 0", name="work_revision_valid"),
        CheckConstraint("origin IN ('web', 'manual')", name="origin_valid"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID | None] = mapped_column(ForeignKey("workspaces.id"), index=True)
    submission_id: Mapped[UUID] = mapped_column(unique=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(254))
    whatsapp: Mapped[str] = mapped_column(String(20))
    property_kind: Mapped[str] = mapped_column(String(32))
    locality: Mapped[str] = mapped_column(String(160))
    area_m2: Mapped[float] = mapped_column()
    rooms: Mapped[int] = mapped_column()
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="SOLICITADO", index=True)
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey("organizations.id"), index=True)
    tour_id: Mapped[UUID | None] = mapped_column(unique=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    operations_notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_version_id: Mapped[UUID | None] = mapped_column()
    work_revision: Mapped[int] = mapped_column(default=0, server_default="0")
    delivery_document: Mapped[dict | None] = mapped_column(JSONB)
    origin: Mapped[str] = mapped_column(String(12), default="web", server_default="web")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ServiceEvent(Base):
    __tablename__ = "service_request_events"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    request_id: Mapped[UUID] = mapped_column(ForeignKey("service_requests.id"), index=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    previous_status: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
