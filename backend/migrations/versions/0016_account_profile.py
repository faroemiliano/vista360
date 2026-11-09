"""Perfil privado de cuenta, avatar y cambio confirmado de email."""
from alembic import op
import sqlalchemy as sa

revision = '0016_account_profile'
down_revision = '0015_account_security'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('display_name', sa.String(160), nullable=False, server_default=''))
    op.add_column('users', sa.Column('account_kind', sa.String(16), nullable=False, server_default='individual'))
    for name, length in [('phone', 20), ('company_name', 200), ('pending_email', 254), ('avatar_key', 300), ('avatar_backend', 16)]:
        op.add_column('users', sa.Column(name, sa.String(length), nullable=True))
    op.add_column('auth_actions', sa.Column('target_email', sa.String(254), nullable=True))


def downgrade():
    op.execute("UPDATE auth_actions SET used_at = CURRENT_TIMESTAMP WHERE purpose = 'change_email' AND used_at IS NULL")
    op.drop_column('auth_actions', 'target_email')
    for name in ['avatar_backend', 'avatar_key', 'pending_email', 'company_name', 'phone', 'account_kind', 'display_name']:
        op.drop_column('users', name)
