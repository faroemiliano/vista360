from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("id", "tour_id"),
        ForeignKeyConstraint(["parent_asset_id", "tour_id"], ["assets.id", "assets.tour_id"], ondelete="CASCADE"),
        CheckConstraint("size_bytes > 0", name="size_positive"),
        CheckConstraint("status IN ('pending','uploading','uploaded','processing','ready','rejected')", name="status_valid"),
        CheckConstraint("type IN ('panorama_original','panorama_delivery')", name="type_valid"),
        CheckConstraint("storage_backend IN ('local','s3')", name="backend_valid"),
        CheckConstraint("width IS NULL OR width > 0", name="width_positive"),
        CheckConstraint("height IS NULL OR height > 0", name="height_positive"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tour_id: Mapped[UUID] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    parent_asset_id: Mapped[UUID | None] = mapped_column()
    type: Mapped[str] = mapped_column(String(32))
    source: Mapped[str] = mapped_column(String(32), default="camera_360")
    storage_backend: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(String(300), unique=True)
    mime_type: Mapped[str] = mapped_column(String(64), default="image/jpeg")
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column()
    height: Mapped[int | None] = mapped_column()
    checksum_sha256: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), index=True)
    error_code: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
    upload_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        CheckConstraint("status IN ('queued','running','succeeded','failed','cancelled')", name="status_valid"),
        CheckConstraint("kind IN ('validate_panorama','delete_file','publish_tour')", name="kind_valid"),
        CheckConstraint("attempts >= 0", name="attempts_nonnegative"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    asset_id: Mapped[UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), index=True, default="queued")
    attempts: Mapped[int] = mapped_column(default=0)
    lease_id: Mapped[UUID | None] = mapped_column()
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    error_code: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
