from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, ForeignKeyConstraint, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Scene(Base):
    __tablename__ = "scenes"
    __table_args__ = (
        UniqueConstraint("id", "tour_id"),
        UniqueConstraint("tour_id", "sort_order", deferrable=True, initially="DEFERRED"),
        CheckConstraint("sort_order >= 0", name="order_nonnegative"),
        CheckConstraint("initial_yaw >= -180 AND initial_yaw < 180", name="yaw_range"),
        CheckConstraint("initial_pitch >= -90 AND initial_pitch <= 90", name="pitch_range"),
        CheckConstraint("initial_hfov >= 50 AND initial_hfov <= 110", name="hfov_range"),
        CheckConstraint("content_type = 'panorama_360'", name="panorama_only"),
        Index("ix_scenes_tour_order", "tour_id", "sort_order"),
        ForeignKeyConstraint(["panorama_asset_id", "tour_id"], ["assets.id", "assets.tour_id"], name="fk_scenes_panorama_asset", use_alter=True),
        ForeignKeyConstraint(["pending_panorama_asset_id", "tour_id"], ["assets.id", "assets.tour_id"], name="fk_scenes_pending_panorama_asset", use_alter=True),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tour_id: Mapped[UUID] = mapped_column(ForeignKey("tours.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    content_type: Mapped[str] = mapped_column(String(32), default="panorama_360", server_default="panorama_360")
    panorama_asset_id: Mapped[UUID | None] = mapped_column()
    pending_panorama_asset_id: Mapped[UUID | None] = mapped_column()
    sort_order: Mapped[int] = mapped_column()
    initial_yaw: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    initial_pitch: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    initial_hfov: Mapped[float] = mapped_column(Float, default=90, server_default="90")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
