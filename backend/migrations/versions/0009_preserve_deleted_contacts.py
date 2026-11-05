"""Eliminar de las listas activas sin perder referencias históricas de los trabajos."""
from alembic import op
import sqlalchemy as sa

revision = '0009_deletions'
down_revision = '0008_individuals'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('organizations', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('business_clients', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    deleted = op.get_bind().scalar(sa.text('SELECT EXISTS (SELECT 1 FROM organizations WHERE deleted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM business_clients WHERE deleted_at IS NOT NULL)'))
    if deleted:
        raise RuntimeError('Hay eliminaciones registradas. El downgrade las volvería a mostrar; no se modificarán esos datos.')
    op.drop_column('business_clients', 'deleted_at')
    op.drop_column('organizations', 'deleted_at')
