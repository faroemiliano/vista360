"""Conserva el teléfono completo de la ficha del cliente en sus trabajos."""
from alembic import op
import sqlalchemy as sa

revision = '0019_work_contact_profile'
down_revision = '0018_delivery_document'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('service_requests', 'whatsapp', existing_type=sa.String(20), type_=sa.String(50), existing_nullable=False)
    op.alter_column('business_clients', 'phone', existing_type=sa.String(40), type_=sa.String(50), existing_nullable=False)


def downgrade():
    # PostgreSQL impide reducir campos si hay teléfonos que no caben.
    # Nunca se recortan datos del cliente automáticamente.
    op.alter_column('business_clients', 'phone', existing_type=sa.String(50), type_=sa.String(40), existing_nullable=False)
    op.alter_column('service_requests', 'whatsapp', existing_type=sa.String(50), type_=sa.String(20), existing_nullable=False)
