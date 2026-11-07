"""Ubicación pública opcional y explícita del recorrido."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014_tour_public_location"
down_revision = "0013_studio_request_pages"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tours", sa.Column("public_location", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("tours", "public_location")
