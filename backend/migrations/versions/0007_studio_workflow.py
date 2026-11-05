"""Vincular trabajos con recorridos y registrar visitas y entregas. Sólo esquema aditivo."""
from alembic import op
import sqlalchemy as sa

revision = '0007_workflow'
down_revision = '0006_business'
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint('uq_tours_id_organization', 'tours', ['id', 'organization_id'])
    op.add_column('service_requests', sa.Column('organization_id', sa.Uuid(), nullable=True))
    op.add_column('service_requests', sa.Column('tour_id', sa.Uuid(), nullable=True))
    op.add_column('service_requests', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('service_requests', sa.Column('operations_notes', sa.Text(), server_default='', nullable=False))
    op.add_column('service_requests', sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('service_requests', sa.Column('delivered_version_id', sa.Uuid(), nullable=True))
    op.add_column('service_requests', sa.Column('work_revision', sa.Integer(), server_default='0', nullable=False))
    op.add_column('service_requests', sa.Column('origin', sa.String(12), server_default='web', nullable=False))
    op.create_index('ix_service_requests_organization_id', 'service_requests', ['organization_id'])
    op.create_unique_constraint('uq_service_requests_tour_id', 'service_requests', ['tour_id'])
    op.create_foreign_key('fk_service_requests_organization_id_organizations', 'service_requests', 'organizations', ['organization_id'], ['id'])
    op.create_foreign_key('fk_service_work_tour', 'service_requests', 'tours', ['tour_id', 'organization_id'], ['id', 'organization_id'])
    op.create_check_constraint('work_assignment', 'service_requests', '(organization_id IS NULL) = (tour_id IS NULL)')
    op.create_check_constraint('work_revision_valid', 'service_requests', 'work_revision >= 0')
    op.create_check_constraint('origin_valid', 'service_requests', "origin IN ('web', 'manual')")


def downgrade():
    op.drop_constraint(op.f('ck_service_requests_origin_valid'), 'service_requests', type_='check')
    op.drop_constraint(op.f('ck_service_requests_work_revision_valid'), 'service_requests', type_='check')
    op.drop_constraint(op.f('ck_service_requests_work_assignment'), 'service_requests', type_='check')
    op.drop_constraint('fk_service_work_tour', 'service_requests', type_='foreignkey')
    op.drop_constraint('fk_service_requests_organization_id_organizations', 'service_requests', type_='foreignkey')
    op.drop_constraint('uq_service_requests_tour_id', 'service_requests', type_='unique')
    op.drop_index('ix_service_requests_organization_id', table_name='service_requests')
    for column in ('origin', 'work_revision', 'delivered_version_id', 'delivered_at', 'operations_notes', 'scheduled_at', 'tour_id', 'organization_id'):
        op.drop_column('service_requests', column)
    op.drop_constraint('uq_tours_id_organization', 'tours', type_='unique')
