"""Avisos de solicitudes web en la cola persistente existente."""
from alembic import op

revision = '0012_service_notifications'
down_revision = '0011_client_details'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs',
        "kind IN ('validate_panorama','delete_file','publish_tour','notify_service')")


def downgrade():
    op.execute("DELETE FROM processing_jobs WHERE kind = 'notify_service'")
    op.drop_constraint(op.f('ck_processing_jobs_kind_valid'), 'processing_jobs', type_='check')
    op.create_check_constraint('kind_valid', 'processing_jobs',
        "kind IN ('validate_panorama','delete_file','publish_tour')")
