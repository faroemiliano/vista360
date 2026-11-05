from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
import psycopg
from psycopg import sql
from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import User
from app.modules.organizations.models import Membership
from app.modules.scenes.models import Scene
from app.modules.studio.models import ServiceRequest
from app.modules.tours.models import Tour


def test_upgrade_assigns_legacy_clients_without_changing_history(database, monkeypatch):
    """Base aparte en 0009: no se hace downgrade de datos actuales ni reales."""
    url = make_url(database[1])
    name = f'vista360_migration_{uuid4().hex[:12]}_test'
    admin = psycopg.connect(url.set(drivername='postgresql', database='postgres').render_as_string(hide_password=False), autocommit=True)
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    migration_url = url.set(database=name).render_as_string(hide_password=False)
    engine = create_engine(migration_url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    try:
        with monkeypatch.context() as patch:
            patch.setenv('DATABASE_URL', migration_url)
            get_settings.cache_clear()
            command.upgrade(config, '0009_deletions')
            old = MetaData()
            old.reflect(engine)
            u1, u2, u3 = uuid4(), uuid4(), uuid4()
            c1, c2, c3, archived = uuid4(), uuid4(), uuid4(), uuid4()
            earlier = datetime(2026, 1, 1, tzinfo=timezone.utc)
            with Session(engine) as db:
                db.add_all([User(id=uid, email_normalized=f'{index}@migration.example.com', password_hash='unchanged') for index, uid in enumerate([u1, u2, u3])])
                db.flush()
                db.execute(old.tables['organizations'].insert(), [
                    {'id': cid, 'name': label, 'kind': kind, 'tour_limit': 10, 'member_limit': 5,
                     'storage_quota_bytes': 1024**3, 'deleted_at': earlier if cid == archived else None}
                    for cid, label, kind in [(c1, 'Remax', 'agency'), (c2, 'Persona', 'individual'), (c3, 'Remax', 'agency'), (archived, 'Histórico', 'company')]
                ])
                db.add_all([Membership(organization_id=cid, user_id=owner, role='owner', created_at=earlier) for cid, owner in [(c1, u1), (c2, u1), (c3, u2), (archived, u1)]])
                db.add(Membership(organization_id=c1, user_id=u2, role='owner', created_at=earlier + timedelta(days=1)))
                db.flush()
                tour = Tour(owner_id=u1, organization_id=archived, title='Recorrido histórico', slug='conservar-este-enlace')
                db.add(tour); db.flush()
                db.add(Scene(tour_id=tour.id, name='Living', sort_order=0, initial_hfov=110))
                db.add(ServiceRequest(submission_id=uuid4(), fingerprint='a' * 64, name='Contacto anterior',
                    email='contact@example.com', whatsapp='12345678', property_kind='casa', locality='BA',
                    area_m2=85, rooms=3, message='No perder notas', status='CONFIRMADO', origin='manual',
                    organization_id=archived, tour_id=tour.id, operations_notes='Conservar visita'))
                db.commit()
            def snapshot():
                with engine.connect() as connection:
                    return {name: sorted([dict(row) for row in connection.execute(select(table)).mappings()], key=repr)
                        for name, table in old.tables.items() if name != 'alembic_version'}
            before = snapshot()
            command.upgrade(config, 'head')
            assert snapshot() == before  # Todas las columnas previas, no sólo conteos.
            current = MetaData(); current.reflect(engine)
            with engine.connect() as connection:
                workspaces = list(connection.execute(select(current.tables['workspaces'])).mappings())
                assert len(workspaces) == 3  # También la cuenta sin clientes.
                by_owner = {row['owner_id']: row['id'] for row in workspaces}
                clients = {row['id']: row['workspace_id'] for row in connection.execute(select(current.tables['organizations'])).mappings()}
                assert clients == {c1: by_owner[u1], c2: by_owner[u1], c3: by_owner[u2], archived: by_owner[u1]}
            command.check(config)
    finally:
        get_settings.cache_clear()
        engine.dispose()
        admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))
        admin.close()
