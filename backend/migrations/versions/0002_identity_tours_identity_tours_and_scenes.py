"""identity tours and scenes

Revision ID: 0002_identity_tours
Revises: 0001_base
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0002_identity_tours'
down_revision: Union[str, Sequence[str], None] = '0001_base'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('email_normalized', sa.String(length=254), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email_normalized', name=op.f('uq_users_email_normalized'))
    )
    op.create_table('auth_sessions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_auth_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_auth_sessions')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_auth_sessions_token_hash'))
    )
    op.create_index(op.f('ix_auth_sessions_expires_at'), 'auth_sessions', ['expires_at'], unique=False)
    op.create_index(op.f('ix_auth_sessions_user_id'), 'auth_sessions', ['user_id'], unique=False)
    op.create_table('tours',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('owner_id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('slug', sa.String(length=100), nullable=False),
    sa.Column('description', sa.Text(), server_default='', nullable=False),
    sa.Column('status', sa.String(length=16), server_default='draft', nullable=False),
    sa.Column('start_scene_id', sa.Uuid(), nullable=True),
    sa.Column('revision', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'", name=op.f('ck_tours_slug_format')),
    sa.CheckConstraint("status = 'draft'", name=op.f('ck_tours_draft_only')),
    sa.CheckConstraint('revision >= 0', name=op.f('ck_tours_revision_nonnegative')),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_tours_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tours')),
    sa.UniqueConstraint('slug', name=op.f('uq_tours_slug'))
    )
    op.create_index(op.f('ix_tours_owner_id'), 'tours', ['owner_id'], unique=False)
    op.create_table('scenes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('tour_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('content_type', sa.String(length=32), server_default='panorama_360', nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('initial_yaw', sa.Float(), server_default='0', nullable=False),
    sa.Column('initial_pitch', sa.Float(), server_default='0', nullable=False),
    sa.Column('initial_hfov', sa.Float(), server_default='90', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("content_type = 'panorama_360'", name=op.f('ck_scenes_panorama_only')),
    sa.CheckConstraint('initial_hfov >= 50 AND initial_hfov <= 110', name=op.f('ck_scenes_hfov_range')),
    sa.CheckConstraint('initial_pitch >= -90 AND initial_pitch <= 90', name=op.f('ck_scenes_pitch_range')),
    sa.CheckConstraint('initial_yaw >= -180 AND initial_yaw < 180', name=op.f('ck_scenes_yaw_range')),
    sa.CheckConstraint('sort_order >= 0', name=op.f('ck_scenes_order_nonnegative')),
    sa.ForeignKeyConstraint(['tour_id'], ['tours.id'], name=op.f('fk_scenes_tour_id_tours'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_scenes')),
    sa.UniqueConstraint('id', 'tour_id', name=op.f('uq_scenes_id')),
    sa.UniqueConstraint('tour_id', 'sort_order', deferrable=True, initially='DEFERRED', name=op.f('uq_scenes_tour_id'))
    )
    op.create_index('ix_scenes_tour_order', 'scenes', ['tour_id', 'sort_order'], unique=False)
    op.create_foreign_key('fk_tours_start_scene', 'tours', 'scenes', ['start_scene_id', 'id'], ['id', 'tour_id'])


def downgrade() -> None:
    op.drop_constraint('fk_tours_start_scene', 'tours', type_='foreignkey')
    op.drop_index('ix_scenes_tour_order', table_name='scenes')
    op.drop_table('scenes')
    op.drop_index(op.f('ix_tours_owner_id'), table_name='tours')
    op.drop_table('tours')
    op.drop_index(op.f('ix_auth_sessions_user_id'), table_name='auth_sessions')
    op.drop_index(op.f('ix_auth_sessions_expires_at'), table_name='auth_sessions')
    op.drop_table('auth_sessions')
    op.drop_table('users')
