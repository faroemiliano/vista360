"""Planes manuales por estudio, conservando el acceso de cuentas existentes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0017_subscriptions'
down_revision = '0016_account_profile'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('subscriptions',
        sa.Column('workspace_id', sa.Uuid(), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('plan_code', sa.String(20), nullable=False),
        sa.Column('status', sa.String(16), nullable=False, server_default='active'),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('period_end', sa.DateTime(timezone=True)),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint("plan_code IN ('legacy','trial','professional','studio')", name=op.f('ck_subscriptions_plan_valid')),
        sa.CheckConstraint("status IN ('active','cancelled')", name=op.f('ck_subscriptions_status_valid')),
        sa.CheckConstraint('revision >= 0', name=op.f('ck_subscriptions_revision_valid')),
        sa.CheckConstraint("(plan_code = 'legacy' AND period_end IS NULL) OR (plan_code != 'legacy' AND period_end IS NOT NULL AND period_end > period_start)", name=op.f('ck_subscriptions_period_valid')),
    )
    op.execute("INSERT INTO subscriptions (workspace_id, plan_code) SELECT id, 'legacy' FROM workspaces")
    op.create_table('subscription_events',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('workspace_id', sa.Uuid(), sa.ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False),
        sa.Column('actor_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(24), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('before', JSONB(), nullable=False), sa.Column('after', JSONB(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_subscription_events_workspace_id', 'subscription_events', ['workspace_id'])


def downgrade():
    op.drop_table('subscription_events')
    op.drop_table('subscriptions')
