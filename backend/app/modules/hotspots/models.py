from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKeyConstraint, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Hotspot(Base):
    __tablename__ = "hotspots"
    __table_args__ = (
        ForeignKeyConstraint(["scene_id", "tour_id"], ["scenes.id", "scenes.tour_id"], ondelete="CASCADE", name="fk_hotspots_source"),
        ForeignKeyConstraint(["target_scene_id", "tour_id"], ["scenes.id", "scenes.tour_id"], name="fk_hotspots_target"),
        CheckConstraint("yaw >= -180 AND yaw < 180", name="yaw_range"),
        CheckConstraint("pitch >= -90 AND pitch <= 90", name="pitch_range"),
        CheckConstraint("length(trim(label)) BETWEEN 1 AND 120", name="label_length"),
        CheckConstraint("(type = 'navigation' AND target_scene_id IS NOT NULL AND target_scene_id <> scene_id AND content IS NULL) OR "
                        "(type = 'info' AND target_scene_id IS NULL AND content IS NOT NULL AND jsonb_typeof(content) = 'object' "
                        "AND content ? 'text' AND jsonb_typeof(content->'text') = 'string' AND length(content->>'text') BETWEEN 1 AND 2000)", name="payload_shape"),
        Index("ix_hotspots_scene", "scene_id"),
        Index("ix_hotspots_target", "target_scene_id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tour_id: Mapped[UUID] = mapped_column()
    scene_id: Mapped[UUID] = mapped_column()
    type: Mapped[str] = mapped_column(String(16))
    yaw: Mapped[float] = mapped_column(Float)
    pitch: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(120))
    target_scene_id: Mapped[UUID | None] = mapped_column()
    content: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
