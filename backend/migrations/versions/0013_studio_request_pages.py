"""Formularios públicos por estudio y consultas privadas por titular."""
from alembic import op
import sqlalchemy as sa

revision = '0013_studio_request_pages'
down_revision = '0012_service_notifications'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('workspaces', sa.Column('request_token', sa.Uuid(), nullable=True))
    op.create_unique_constraint(None, 'workspaces', ['request_token'])
    op.add_column('service_requests', sa.Column('workspace_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(None, 'service_requests', 'workspaces', ['workspace_id'], ['id'])
    op.create_index(None, 'service_requests', ['workspace_id'])


def downgrade():
    # No convertir consultas privadas en consultas globales al volver de versión.
    connection = op.get_bind()
    if connection.execute(sa.text('SELECT EXISTS(SELECT 1 FROM service_requests WHERE workspace_id IS NOT NULL)')).scalar():
        raise RuntimeError('Hay consultas privadas; conservar la migración para no perder su aislamiento.')
    op.drop_index(op.f('ix_service_requests_workspace_id'), table_name='service_requests')
    op.drop_constraint(op.f('fk_service_requests_workspace_id_workspaces'), 'service_requests', type_='foreignkey')
    op.drop_column('service_requests', 'workspace_id')
    op.drop_constraint(op.f('uq_workspaces_request_token'), 'workspaces', type_='unique')
    op.drop_column('workspaces', 'request_token')
