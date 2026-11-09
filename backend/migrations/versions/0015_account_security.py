"""Acciones de cuenta y límites de acceso persistentes."""
from alembic import op
import sqlalchemy as sa

revision = '0015_account_security'
down_revision = '0014_tour_public_location'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('email_verification_required', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table('auth_actions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('purpose', sa.String(16), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index('ix_auth_actions_user_id', 'auth_actions', ['user_id'])
    op.create_index('ix_auth_actions_expires_at', 'auth_actions', ['expires_at'])
    op.create_table('auth_rate_buckets',
        sa.Column('key_hash', sa.String(64), primary_key=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.BigInteger(), nullable=False))
    op.create_index('ix_auth_rate_buckets_started_at', 'auth_rate_buckets', ['started_at'])
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs', "kind IN ('validate_panorama','delete_file','publish_tour','notify_service','notify_auth')")


def downgrade():
    op.execute("DELETE FROM processing_jobs WHERE kind = 'notify_auth'")
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs', "kind IN ('validate_panorama','delete_file','publish_tour','notify_service')")
    op.drop_table('auth_rate_buckets')
    op.drop_table('auth_actions')
    op.drop_column('users', 'email_verification_required')
    op.drop_column('users', 'email_verified_at')
