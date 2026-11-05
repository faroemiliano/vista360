"""Datos internos de organizaciones y particulares."""
from alembic import op
import sqlalchemy as sa

revision = '0011_client_details'
down_revision = '0010_workspaces'
branch_labels = None
depends_on = None

FIELDS = {'legal_name': 200, 'email': 254, 'phone': 50, 'locality': 160,
          'contact_name': 160, 'address': 300, 'notes': 2000}


def upgrade():
    for name, length in FIELDS.items():
        op.add_column('organizations', sa.Column(name, sa.String(length), nullable=True))


def downgrade():
    for name in reversed(FIELDS):
        op.drop_column('organizations', name)
