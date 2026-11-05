from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Publication(Base):
    __tablename__ = "tour_publications"
    __table_args__ = (
        UniqueConstraint("id", "tour_id"),
        UniqueConstraint("tour_id", "version"),
        CheckConstraint("version > 0 AND revision >= 0 AND schema_version = 1", name="version_valid"),
        CheckConstraint("status IN ('preparing','active','retired','failed')", name="status_valid"),
        CheckConstraint("storage_backend IN ('local','s3')", name="backend_valid"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tour_id: Mapped[UUID] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column()
    revision: Mapped[int] = mapped_column(BigInteger)
    schema_version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(16), index=True)
    storage_backend: Mapped[str] = mapped_column(String(16))
    document: Mapped[dict] = mapped_column(JSONB)
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PublicationAsset(Base):
    """Retención relacional: ningún asset usado por un snapshot se elimina antes de retirarlo."""
    __tablename__ = "publication_assets"
    __table_args__ = (
        ForeignKeyConstraint(["publication_id", "tour_id"], ["tour_publications.id", "tour_publications.tour_id"], ondelete="CASCADE"),
        ForeignKeyConstraint(["asset_id", "tour_id"], ["assets.id", "assets.tour_id"]),
    )
    publication_id: Mapped[UUID] = mapped_column(primary_key=True)
    asset_id: Mapped[UUID] = mapped_column(primary_key=True, index=True)
    tour_id: Mapped[UUID] = mapped_column()
