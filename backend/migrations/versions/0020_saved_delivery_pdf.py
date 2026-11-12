"""Conservar el archivo PDF de entrega sin modificar trabajos existentes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0020_saved_delivery_pdf'
down_revision = '0019_work_contact_profile'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('service_requests', sa.Column('delivery_file', postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column('service_requests', 'delivery_file')
