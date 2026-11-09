from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email_normalized: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(160), default="", server_default="")
    account_kind: Mapped[str] = mapped_column(String(16), default="individual", server_default="individual")
    phone: Mapped[str | None] = mapped_column(String(20))
    company_name: Mapped[str | None] = mapped_column(String(200))
    pending_email: Mapped[str | None] = mapped_column(String(254))
    avatar_key: Mapped[str | None] = mapped_column(String(300))
    avatar_backend: Mapped[str | None] = mapped_column(String(16))

    @property
    def avatar_url(self):
        return f"/api/v1/auth/avatar?v={self.avatar_key.rsplit('/', 1)[-1]}" if self.avatar_key else None

    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_verification_required: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthAction(Base):
    __tablename__ = 'auth_actions'
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    purpose: Mapped[str] = mapped_column(String(16))
    target_email: Mapped[str | None] = mapped_column(String(254))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthRateBucket(Base):
    __tablename__ = 'auth_rate_buckets'
    key_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    attempts: Mapped[int] = mapped_column(BigInteger)
