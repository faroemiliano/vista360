"""Permitir espacios de recorridos contratados por particulares, sin reclasificar datos."""
from alembic import op
from sqlalchemy import text

revision = '0008_individuals'
down_revision = '0007_workflow'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint(op.f('ck_organizations_kind_valid'), 'organizations', type_='check')
    op.create_check_constraint(op.f('ck_organizations_kind_valid'), 'organizations',
        "kind IN ('agency','photographer','company','studio','individual')")


def downgrade():
    # No convertir ni borrar personas para satisfacer el esquema anterior.
    if op.get_bind().scalar(text("SELECT EXISTS (SELECT 1 FROM organizations WHERE kind = 'individual')")):
        raise RuntimeError('Hay particulares registrados. La revisión anterior no los admite; no se modificarán sus datos.')
    op.drop_constraint(op.f('ck_organizations_kind_valid'), 'organizations', type_='check')
    op.create_check_constraint(op.f('ck_organizations_kind_valid'), 'organizations',
        "kind IN ('agency','photographer','company','studio')")
