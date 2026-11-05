"""persistent_hotspots

Revision ID: 0004_hotspots
Revises: 0003_assets
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0004_hotspots'
down_revision: Union[str, Sequence[str], None] = '0003_assets'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('hotspots',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('tour_id', sa.Uuid(), nullable=False),
    sa.Column('scene_id', sa.Uuid(), nullable=False),
    sa.Column('type', sa.String(length=16), nullable=False),
    sa.Column('yaw', sa.Float(), nullable=False),
    sa.Column('pitch', sa.Float(), nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('target_scene_id', sa.Uuid(), nullable=True),
    sa.Column('content', postgresql.JSONB(none_as_null=True, astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("(type = 'navigation' AND target_scene_id IS NOT NULL AND target_scene_id <> scene_id AND content IS NULL) OR (type = 'info' AND target_scene_id IS NULL AND content IS NOT NULL AND jsonb_typeof(content) = 'object' AND content ? 'text' AND jsonb_typeof(content->'text') = 'string' AND length(content->>'text') BETWEEN 1 AND 2000)", name=op.f('ck_hotspots_payload_shape')),
    sa.CheckConstraint('length(trim(label)) BETWEEN 1 AND 120', name=op.f('ck_hotspots_label_length')),
    sa.CheckConstraint('pitch >= -90 AND pitch <= 90', name=op.f('ck_hotspots_pitch_range')),
    sa.CheckConstraint('yaw >= -180 AND yaw < 180', name=op.f('ck_hotspots_yaw_range')),
    sa.ForeignKeyConstraint(['scene_id', 'tour_id'], ['scenes.id', 'scenes.tour_id'], name='fk_hotspots_source', ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['target_scene_id', 'tour_id'], ['scenes.id', 'scenes.tour_id'], name='fk_hotspots_target'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_hotspots'))
    )
    op.create_index('ix_hotspots_scene', 'hotspots', ['scene_id'], unique=False)
    op.create_index('ix_hotspots_target', 'hotspots', ['target_scene_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_hotspots_target', table_name='hotspots')
    op.drop_index('ix_hotspots_scene', table_name='hotspots')
    op.drop_table('hotspots')
