from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import get_settings
from app.db.base import Base
from app.modules.auth import models as auth_models
from app.modules.tours import models as tour_models
from app.modules.scenes import models as scene_models
from app.modules.assets import models as asset_models
from app.modules.hotspots import models as hotspot_models
from app.modules.publications import models as publication_models
from app.modules.organizations import models as organization_models
from app.modules.properties import models as property_models
from app.modules.studio import models as studio_models
from app.modules.workspaces import models as workspace_models
from app.modules.subscriptions import models as subscription_models

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Importar aquí los modelos de dominio cuando sean implementados.
target_metadata = Base.metadata
database_url = get_settings().database_url.get_secret_value()


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(
        database_url, poolclass=pool.NullPool, connect_args={"connect_timeout": 5}
    )
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
