# Vista360

Base de desarrollo de la **Fase 1** de [PLAN.md](PLAN.md). Frontend React + TypeScript + Vite, backend FastAPI, SQLAlchemy, Alembic y PostgreSQL local. La única ruta de aplicación implementada es `GET /health`; no hay entidades ni funcionalidades de negocio. El frontend muestra una pantalla inicial estática.

## Requisitos

- Node.js 20.19+ o 22.12+ y npm. Verificar `node --version`; se comprobó con Node 20.20.2. Si usás nvm, seleccioná una versión compatible antes de instalar.
- Python 3.12+; se comprobó con Python 3.12.
- Docker con Compose v2 y el daemon iniciado, por ejemplo Docker Desktop.
- Git.

Dependencias frontend fijadas en `package.json` y `package-lock.json`. Dependencias backend directas fijadas en `pyproject.toml` y transitivas en `requirements.lock`. No instalar globalmente dependencias Python ni ejecutar con `sudo`.

## Configuración local

Desde la raíz del repositorio, en una instalación nueva:

```sh
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Si esos archivos ya existen, conservarlos; no sobrescribir credenciales de una base inicializada. Los `.env.example` contienen valores de ejemplo sin secretos reales. Los `.env` locales y artefactos están excluidos de Git.

Reemplazar `replace-with-local-password` en `.env` y en `backend/.env` por la misma contraseña local. Podés generar una con `python3 -c 'import secrets; print(secrets.token_hex(24))'`. Una contraseña hexadecimal evita caracteres que necesiten codificarse en la URL; para otras contraseñas, aplicar percent-encoding en `DATABASE_URL`.

| Archivo | Variables |
| --- | --- |
| `.env` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` para Compose |
| `backend/.env` | `APP_NAME`, `DATABASE_URL`, `CORS_ORIGINS` como array JSON de orígenes exactos |
| `frontend/.env` | `VITE_API_BASE_URL`, reservada para la integración futura con API |

El backend carga su `.env` por ruta absoluta, independientemente del directorio desde el cual se importa; las variables del proceso tienen prioridad. `DATABASE_URL` es obligatoria y usa el dialecto `postgresql+psycopg`. La URL y sus credenciales no se imprimen en la configuración. Las variables `VITE_*` son públicas y se incorporan al build: nunca poner secretos allí. La pantalla inicial todavía no realiza peticiones a la API.

Durante la implementación se generaron los tres `.env` locales con una contraseña aleatoria compartida, sin imprimirla. En este workspace no hace falta copiarlos nuevamente.

## 1. Iniciar PostgreSQL

Desde la raíz:

```sh
docker compose up -d --wait db
docker compose ps
```

PostgreSQL 17 queda disponible en `127.0.0.1:55433`, con volumen persistente `vista360_postgres_data`. El puerto del contenedor es 5432. Sólo se expone la interfaz loopback y no se modifica ninguna instalación PostgreSQL del host.

Si el puerto está ocupado, cambiar `POSTGRES_PORT` y el puerto de `DATABASE_URL` conjuntamente. Usuario, contraseña y nombre de base de las variables `POSTGRES_*` se aplican al inicializar un volumen nuevo; cambiarlas después no cambia automáticamente las credenciales de la base existente.

## 2. Instalar y ejecutar backend

Desde la raíz:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e . -c requirements.lock
python -m pip check
python -m app.db.check
alembic upgrade head
alembic current
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

En este workspace el entorno virtual ya está instalado; para iniciar sólo necesitás activarlo, aplicar migraciones si corresponde y ejecutar Uvicorn.

- Healthcheck: <http://localhost:8001/health> → `{"status":"ok"}`.
- Documentación OpenAPI: <http://localhost:8001/docs>.

El healthcheck verifica que el proceso HTTP responde; no consulta PostgreSQL ni garantiza readiness de la base. `python -m app.db.check` ejecuta `SELECT 1` contra la base configurada. Los fallos de conexión hacen que el comando termine con error. SQLAlchemy abre conexiones cuando se necesitan; el arranque HTTP no ejecuta migraciones ni crea tablas automáticamente.

La revisión `0001_base` es intencionalmente vacía. Al aplicarla, Alembic crea únicamente su tabla `alembic_version`. El metadata SQLAlchemy todavía no incluye modelos de negocio. La fábrica de sesiones tiene `pool_pre_ping`, timeout de conexión y cierre de recursos al apagar el backend; cada futuro caso de uso controlará su transacción.

Para verificar estado y generación de cambios:

```sh
alembic current
alembic check
```

Cuando una fase posterior incorpore modelos, importarlos en `migrations/env.py`, generar una revisión con `alembic revision --autogenerate -m "descripcion"` y revisar el SQL antes de aplicarlo. No generar modelos ahora.

## 3. Instalar y ejecutar frontend

En otra terminal, desde la raíz:

```sh
cd frontend
npm ci
npm run dev
```

Abrir <http://localhost:5174>. El servidor usa puerto fijo y falla si está ocupado, para que la configuración CORS no cambie silenciosamente.

Build con verificación TypeScript y previsualización:

```sh
npm run build
npm run preview
```

El build queda en `frontend/dist/` y el preview en <http://localhost:4173>. No hay router, visor 360 ni dependencias de UI adicionales.

## Verificaciones realizadas

Se comprobaron en este entorno:

- Instalación del frontend desde lockfile, TypeScript estricto y build Vite.
- Arranque de Uvicorn y respuesta HTTP real del healthcheck.
- Conexión real de SQLAlchemy/Psycopg al PostgreSQL de Compose.
- Upgrade, revisión activa, `alembic check`, downgrade y upgrade de la migración base.
- Esquema público sin tablas de negocio y revisión Alembic `0001_base`.
- Compatibilidad de dependencias Python mediante `pip check`.

Para repetir las verificaciones con backend iniciado, ejecutar `curl --fail http://localhost:8001/health`, `python -m app.db.check` y `alembic check` desde backend, y `npm run build` desde frontend.

## Detener servicios

Ctrl+C detiene frontend y backend. Desde la raíz, `docker compose stop db` detiene PostgreSQL conservando contenedor y datos; `docker compose down` retira contenedor/red y conserva el volumen. No usar la opción `--volumes` salvo que quieras borrar la base local.

## Archivos de la Fase 1

```text
.git/                              repositorio local, rama main
.gitignore
.env.example
compose.yaml
README.md
frontend/
  .env.example
  package.json
  package-lock.json
  index.html
  tsconfig.json
  vite.config.ts
  src/main.tsx
  src/app/App.tsx
  src/styles/global.css
backend/
  .env.example
  pyproject.toml
  requirements.lock
  alembic.ini
  app/__init__.py
  app/main.py
  app/core/__init__.py
  app/core/config.py
  app/db/__init__.py
  app/db/base.py
  app/db/session.py
  app/db/check.py
  migrations/env.py
  migrations/script.py.mako
  migrations/versions/0001_base.py
```

También se generaron `.env`, `backend/.env`, `frontend/.env`, `backend/.venv/`, `frontend/node_modules/`, `frontend/dist/` y caches de Python; todos quedan ignorados. `PLAN.md` se conserva sin cambios. El repositorio Git usa la rama `main`.

## Decisiones de detalle de esta fase

- PostgreSQL 17 mediante Compose; puerto 55433 porque 5433 y 55432 ya estaban ocupados. Frontend en 5174 y backend en 8001 porque 5173 y 8000 también estaban ocupados; CORS y ejemplos usan esos mismos puertos. Imagen fijada a la versión mayor, con actualizaciones de patch dentro de 17.
- SQLAlchemy síncrono + Psycopg 3; no se agrega stack async sin una necesidad concreta. Psycopg binary facilita instalación local sin compiladores/libpq; revisar distribución para producción cuando se prepare el deploy. [Referencia SQLAlchemy](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#module-sqlalchemy.dialects.postgresql.psycopg).
- Pydantic Settings para `.env` y validación; Uvicorn sin extras de rendimiento/watchfiles. [Referencia de configuración](https://docs.pydantic.dev/latest/concepts/pydantic_settings/).
- Migración inicial vacía para verificar Alembic sin anticipar entidades de la Fase 3. [Referencia Alembic](https://alembic.sqlalchemy.org/en/latest/tutorial.html).
- Instalación backend con pip/venv y constraints versionadas, evitando agregar otro gestor. Frontend creado con configuración mínima compatible con Vite, en lugar de conservar demos o herramientas de una plantilla que todavía no se necesitan. [Referencia Vite](https://vite.dev/guide/).
- CORS habilitado sólo para GET y los orígenes configurados; no se activan credenciales ni métodos de autenticación hasta la fase correspondiente.

La Fase 2 requiere aprobación independiente. No se ha instalado Pannellum ni iniciado trabajo del visor.
