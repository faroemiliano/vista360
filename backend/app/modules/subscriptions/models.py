from datetime import datetime
from uuid import UUID, uuid4
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class Subscription(Base):
    __tablename__ = 'subscriptions'
    __table_args__ = (
        CheckConstraint("plan_code IN ('legacy','trial','professional','studio')", name='plan_valid'),
        CheckConstraint("status IN ('active','cancelled')", name='status_valid'),
        CheckConstraint('revision >= 0', name='revision_valid'),
        CheckConstraint("(plan_code = 'legacy' AND period_end IS NULL) OR (plan_code != 'legacy' AND period_end IS NOT NULL AND period_end > period_start)", name='period_valid'),
    )
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True)
    plan_code: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(16), default='active', server_default='active')
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(default=0, server_default='0')


class SubscriptionEvent(Base):
    __tablename__ = 'subscription_events'
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey('workspaces.id', ondelete='CASCADE'), index=True)
    actor_id: Mapped[UUID] = mapped_column(ForeignKey('users.id'))
    action: Mapped[str] = mapped_column(String(24))
    note: Mapped[str] = mapped_column(Text)
    before: Mapped[dict] = mapped_column(JSONB)
    after: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
