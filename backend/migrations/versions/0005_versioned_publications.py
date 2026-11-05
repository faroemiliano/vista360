"""versioned_publications

Revision ID: 0005_publications
Revises: 0004_hotspots
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0005_publications'
down_revision: Union[str, Sequence[str], None] = '0004_hotspots'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('tour_publications',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('tour_id', sa.Uuid(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('revision', sa.BigInteger(), nullable=False),
    sa.Column('schema_version', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('storage_backend', sa.String(length=16), nullable=False),
    sa.Column('document', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('error_code', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('preparing','active','retired','failed')", name=op.f('ck_tour_publications_status_valid')),
    sa.CheckConstraint("storage_backend IN ('local','s3')", name=op.f('ck_tour_publications_backend_valid')),
    sa.CheckConstraint('version > 0 AND revision >= 0 AND schema_version = 1', name=op.f('ck_tour_publications_version_valid')),
    sa.ForeignKeyConstraint(['tour_id'], ['tours.id'], name=op.f('fk_tour_publications_tour_id_tours'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tour_publications')),
    sa.UniqueConstraint('id', 'tour_id', name=op.f('uq_tour_publications_id')),
    sa.UniqueConstraint('tour_id', 'version', name=op.f('uq_tour_publications_tour_id'))
    )
    op.create_index(op.f('ix_tour_publications_status'), 'tour_publications', ['status'], unique=False)
    op.create_index(op.f('ix_tour_publications_tour_id'), 'tour_publications', ['tour_id'], unique=False)
    op.create_table('publication_assets',
    sa.Column('publication_id', sa.Uuid(), nullable=False),
    sa.Column('asset_id', sa.Uuid(), nullable=False),
    sa.Column('tour_id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['asset_id', 'tour_id'], ['assets.id', 'assets.tour_id'], name=op.f('fk_publication_assets_asset_id_assets')),
    sa.ForeignKeyConstraint(['publication_id', 'tour_id'], ['tour_publications.id', 'tour_publications.tour_id'], name=op.f('fk_publication_assets_publication_id_tour_publications'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('publication_id', 'asset_id', name=op.f('pk_publication_assets'))
    )
    op.create_index(op.f('ix_publication_assets_asset_id'), 'publication_assets', ['asset_id'], unique=False)
    op.add_column('tours', sa.Column('published_version_id', sa.Uuid(), nullable=True))
    op.add_column('tours', sa.Column('slug_locked', sa.Boolean(), server_default='false', nullable=False))
    op.create_foreign_key('fk_tours_publication', 'tours', 'tour_publications', ['published_version_id', 'id'], ['id', 'tour_id'], use_alter=True)

    op.drop_constraint(op.f('ck_tours_draft_only'), 'tours', type_='check')
    op.create_check_constraint('status_valid', 'tours', "status IN ('draft','published')")
    op.create_check_constraint('publication_state', 'tours', "(status = 'published') = (published_version_id IS NOT NULL)")
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs', "kind IN ('validate_panorama','delete_file','publish_tour')")


def downgrade() -> None:
    op.execute("DELETE FROM processing_jobs WHERE kind = 'publish_tour'")
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs', "kind IN ('validate_panorama','delete_file')")
    op.drop_constraint(op.f('ck_tours_publication_state'), 'tours', type_='check')
    op.drop_constraint(op.f('ck_tours_status_valid'), 'tours', type_='check')
    op.execute("UPDATE tours SET status = 'draft', published_version_id = NULL")
    op.create_check_constraint('draft_only', 'tours', "status = 'draft'")
    op.drop_constraint('fk_tours_publication', 'tours', type_='foreignkey')
    op.drop_column('tours', 'slug_locked')
    op.drop_column('tours', 'published_version_id')
    op.drop_index(op.f('ix_publication_assets_asset_id'), table_name='publication_assets')
    op.drop_table('publication_assets')
    op.drop_index(op.f('ix_tour_publications_tour_id'), table_name='tour_publications')
    op.drop_index(op.f('ix_tour_publications_status'), table_name='tour_publications')
    op.drop_table('tour_publications')
