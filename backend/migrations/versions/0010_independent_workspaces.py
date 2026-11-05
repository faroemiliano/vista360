"""Separar el estudio que usa Vision360 de sus clientes, sin mover archivos."""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0010_workspaces"
down_revision = "0009_deletions"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("""SELECT EXISTS (
        SELECT 1 FROM organizations o WHERE NOT EXISTS (
            SELECT 1 FROM organization_memberships m WHERE m.organization_id=o.id AND m.role='owner'
        ))""")):
        raise RuntimeError("Hay organizaciones sin propietario. Revisar su titular antes de asignarlas a un estudio; no se modificarán los datos.")
    op.create_table("workspaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], name=op.f("fk_workspaces_owner_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspaces")),
        sa.UniqueConstraint("owner_id", name=op.f("uq_workspaces_owner_id")),
    )
    for user_id in connection.scalars(sa.text("SELECT id FROM users")):
        connection.execute(sa.text("INSERT INTO workspaces (id,owner_id,name) VALUES (:id,:owner,'Mi estudio')"),
            {"id": uuid4(), "owner": user_id})
    op.add_column("organizations", sa.Column("workspace_id", sa.Uuid(), nullable=True))
    # Mantener todos los permisos existentes. En clientes con varios propietarios
    # se toma el primero por fecha y UUID; los demás conservan su acceso explícito.
    connection.execute(sa.text("""UPDATE organizations o SET workspace_id = (
        SELECT w.id FROM organization_memberships m JOIN workspaces w ON w.owner_id=m.user_id
        WHERE m.organization_id=o.id AND m.role='owner'
        ORDER BY m.created_at, m.user_id LIMIT 1
    )"""))
    op.alter_column("organizations", "workspace_id", nullable=False)
    op.create_foreign_key(op.f("fk_organizations_workspace_id_workspaces"), "organizations", "workspaces", ["workspace_id"], ["id"])
    op.create_index(op.f("ix_organizations_workspace_id"), "organizations", ["workspace_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT EXISTS (SELECT 1 FROM workspaces)")):
        raise RuntimeError("Hay estudios registrados. El downgrade perdería su separación y nombres; se requiere una migración explícita de esos datos.")
    op.drop_index(op.f("ix_organizations_workspace_id"), table_name="organizations")
    op.drop_constraint(op.f("fk_organizations_workspace_id_workspaces"), "organizations", type_="foreignkey")
    op.drop_column("organizations", "workspace_id")
    op.drop_table("workspaces")
