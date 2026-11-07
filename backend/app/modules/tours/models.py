from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class Tour(Base):
    __tablename__ = "tours"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_tours_id_organization"),
        CheckConstraint("status IN ('draft','published')", name="status_valid"),
        CheckConstraint("(status = 'published') = (published_version_id IS NOT NULL)", name="publication_state"),
        CheckConstraint("revision >= 0", name="revision_nonnegative"),
        CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name="slug_format"),
        ForeignKeyConstraint(["start_scene_id", "id"], ["scenes.id", "scenes.tour_id"],
                             name="fk_tours_start_scene", use_alter=True),
        ForeignKeyConstraint(["published_version_id", "id"], ["tour_publications.id", "tour_publications.tour_id"], name="fk_tours_publication", use_alter=True),
        ForeignKeyConstraint(["property_id", "organization_id"], ["properties.id", "properties.organization_id"], name="fk_tours_property"),
        CheckConstraint("property_id IS NULL OR organization_id IS NOT NULL", name="property_organization"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[UUID | None] = mapped_column(ForeignKey("organizations.id"), index=True)
    property_id: Mapped[UUID | None] = mapped_column()
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    public_location: Mapped[dict | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="draft", server_default="draft")
    start_scene_id: Mapped[UUID | None] = mapped_column()
    published_version_id: Mapped[UUID | None] = mapped_column()
    slug_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    revision: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
