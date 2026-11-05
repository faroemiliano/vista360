"""studio_organizations_properties

Revision ID: 0006_business
Revises: 0005_publications
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0006_business'
down_revision: Union[str, Sequence[str], None] = '0005_publications'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('organizations',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('kind', sa.String(length=24), nullable=False),
    sa.Column('tour_limit', sa.Integer(), nullable=False),
    sa.Column('member_limit', sa.Integer(), nullable=False),
    sa.Column('storage_quota_bytes', sa.BigInteger(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind IN ('agency','photographer','company','studio')", name=op.f('ck_organizations_kind_valid')),
    sa.CheckConstraint('tour_limit > 0 AND member_limit > 0 AND storage_quota_bytes > 0', name=op.f('ck_organizations_limits_positive')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organizations'))
    )
    op.create_table('service_requests',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('submission_id', sa.Uuid(), nullable=False),
    sa.Column('fingerprint', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('whatsapp', sa.String(length=20), nullable=False),
    sa.Column('property_kind', sa.String(length=32), nullable=False),
    sa.Column('locality', sa.String(length=160), nullable=False),
    sa.Column('area_m2', sa.Float(), nullable=False),
    sa.Column('rooms', sa.Integer(), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('SOLICITADO','PRESUPUESTADO','CONFIRMADO','EN_PRODUCCION','EN_REVISION','PUBLICADO','FINALIZADO','CANCELADO')", name=op.f('ck_service_requests_status_valid')),
    sa.CheckConstraint('area_m2 > 0 AND area_m2 <= 10000000 AND rooms BETWEEN 1 AND 10000', name=op.f('ck_service_requests_size_valid')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_service_requests')),
    sa.UniqueConstraint('submission_id', name=op.f('uq_service_requests_submission_id'))
    )
    op.create_index(op.f('ix_service_requests_created_at'), 'service_requests', ['created_at'], unique=False)
    op.create_index(op.f('ix_service_requests_status'), 'service_requests', ['status'], unique=False)
    op.create_table('business_clients',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=True),
    sa.Column('phone', sa.String(length=40), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_business_clients_organization_id_organizations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_business_clients')),
    sa.UniqueConstraint('id', 'organization_id', name=op.f('uq_business_clients_id'))
    )
    op.create_index(op.f('ix_business_clients_organization_id'), 'business_clients', ['organization_id'], unique=False)
    op.create_table('organization_memberships',
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('role', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("role IN ('owner','admin','editor','viewer')", name=op.f('ck_organization_memberships_role_valid')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_organization_memberships_organization_id_organizations')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_organization_memberships_user_id_users')),
    sa.PrimaryKeyConstraint('organization_id', 'user_id', name=op.f('pk_organization_memberships'))
    )
    op.create_index(op.f('ix_organization_memberships_user_id'), 'organization_memberships', ['user_id'], unique=False)
    op.create_table('service_request_events',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('request_id', sa.Uuid(), nullable=False),
    sa.Column('actor_id', sa.Uuid(), nullable=False),
    sa.Column('previous_status', sa.String(length=24), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_service_request_events_actor_id_users')),
    sa.ForeignKeyConstraint(['request_id'], ['service_requests.id'], name=op.f('fk_service_request_events_request_id_service_requests')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_service_request_events'))
    )
    op.create_index(op.f('ix_service_request_events_request_id'), 'service_request_events', ['request_id'], unique=False)
    op.create_table('properties',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('organization_id', sa.Uuid(), nullable=False),
    sa.Column('client_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('kind', sa.String(length=32), nullable=False),
    sa.Column('locality', sa.String(length=160), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('area_m2', sa.Float(), nullable=True),
    sa.Column('rooms', sa.Integer(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('area_m2 IS NULL OR (area_m2 > 0 AND area_m2 <= 10000000)', name=op.f('ck_properties_area_valid')),
    sa.CheckConstraint('rooms IS NULL OR (rooms >= 1 AND rooms <= 10000)', name=op.f('ck_properties_rooms_valid')),
    sa.ForeignKeyConstraint(['client_id', 'organization_id'], ['business_clients.id', 'business_clients.organization_id'], name=op.f('fk_properties_client_id_business_clients')),
    sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], name=op.f('fk_properties_organization_id_organizations')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_properties')),
    sa.UniqueConstraint('id', 'organization_id', name=op.f('uq_properties_id'))
    )
    op.create_index(op.f('ix_properties_organization_id'), 'properties', ['organization_id'], unique=False)
    op.add_column('tours', sa.Column('organization_id', sa.Uuid(), nullable=True))
    op.add_column('tours', sa.Column('property_id', sa.Uuid(), nullable=True))
    op.create_index(op.f('ix_tours_organization_id'), 'tours', ['organization_id'], unique=False)
    op.create_foreign_key(op.f('fk_tours_organization_id_organizations'), 'tours', 'organizations', ['organization_id'], ['id'])
    op.create_foreign_key('fk_tours_property', 'tours', 'properties', ['property_id', 'organization_id'], ['id', 'organization_id'])

    op.create_check_constraint('property_organization', 'tours', 'property_id IS NULL OR organization_id IS NOT NULL')


def downgrade() -> None:
    op.drop_constraint(op.f('ck_tours_property_organization'), 'tours', type_='check')
    op.drop_constraint('fk_tours_property', 'tours', type_='foreignkey')
    op.drop_constraint(op.f('fk_tours_organization_id_organizations'), 'tours', type_='foreignkey')
    op.drop_index(op.f('ix_tours_organization_id'), table_name='tours')
    op.drop_column('tours', 'property_id')
    op.drop_column('tours', 'organization_id')
    op.drop_index(op.f('ix_properties_organization_id'), table_name='properties')
    op.drop_table('properties')
    op.drop_index(op.f('ix_service_request_events_request_id'), table_name='service_request_events')
    op.drop_table('service_request_events')
    op.drop_index(op.f('ix_organization_memberships_user_id'), table_name='organization_memberships')
    op.drop_table('organization_memberships')
    op.drop_index(op.f('ix_business_clients_organization_id'), table_name='business_clients')
    op.drop_table('business_clients')
    op.drop_index(op.f('ix_service_requests_status'), table_name='service_requests')
    op.drop_index(op.f('ix_service_requests_created_at'), table_name='service_requests')
    op.drop_table('service_requests')
    op.drop_table('organizations')
