"""Comprobación manual de conexión: python -m app.db.check."""

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import create_db_engine


def main() -> None:
    engine = create_db_engine(get_settings())
    try:
        with engine.connect() as connection:
            if connection.execute(text("SELECT 1")).scalar_one() != 1:
                raise RuntimeError("Respuesta inesperada de PostgreSQL")
        print("PostgreSQL: conexión verificada (SELECT 1).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
