"""Condiciones del documento de entrega, opcionales para trabajos existentes."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '0018_delivery_document'
down_revision = '0017_subscriptions'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('service_requests', sa.Column('delivery_document', JSONB, nullable=True))


def downgrade():
    op.drop_column('service_requests', 'delivery_document')
