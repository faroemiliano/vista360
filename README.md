# Vision360

Demo de prueba en Render: frontend y API bajo un mismo HTTPS, worker junto a la
API para una única instancia gratuita, PostgreSQL por 30 días y fotos en storage
externo. Configuración en `render.yaml` y [pasos del demo](docs/DEMO_RENDER.md).
No se despliega ni se transfieren datos locales automáticamente.

El visor permite **Mirar con el celular** en dispositivos compatibles: giro e inclinación del teléfono, permiso explícito, centrado y retorno al control táctil. Para probarlo en un teléfono desde un enlace remoto se necesita HTTPS. Ver [visor móvil y validaciones](docs/VISOR_MOVIL.md).

Cada cuenta dispone de un **estudio propio** para operar su negocio. Dentro registra sus clientes (organizaciones o particulares), trabajos y recorridos. El nombre se cambia con Editar estudio en la cabecera. Los accesos compartidos conservan permisos por cliente y no abren toda la cartera de otro estudio. Ver [estudios independientes, migración y alcance SaaS](docs/ESTUDIOS.md).

Las fichas de clientes se abren con **Ver ficha** desde Organizaciones, Particulares o Clientes. Guardan nombre, email, teléfono, localidad, dirección y notas internas; las organizaciones también tienen razón social y responsable. Sólo el nombre es obligatorio. Propietarios y administradores pueden editar y vaciar datos opcionales; sólo propietarios eliminan la ficha de las listas, conservando los trabajos y enlaces. La información es interna y no se incorpora al recorrido público. Requiere la migración aditiva `0011_client_details`: ejecutar `.venv/bin/alembic upgrade head` desde `backend` al actualizar una instalación existente.

Evolución comercial sobre el repositorio Vista360 existente: landing en [/inicio](http://localhost:5174/inicio), panel en [/studio](http://localhost:5174/studio), solicitudes de digitalización y organizaciones con clientes, propiedades y recorridos compartidos según rol. La raíz `/` y `/studio` abren Trabajos. Ver [auditoría, fases, endpoints y alcance de esta entrega](docs/EVOLUCION.md). No hay pagos ni marketplace activos.

El panel tiene historial de navegación: **Atrás/Adelante**, direcciones por sección, trabajo, ficha de cliente y pestaña de Mi cuenta, recarga conservando el destino y el paso y aviso ante cambios sin guardar. El menú y las fichas usan enlaces que permiten abrir otra pestaña; las direcciones desconocidas muestran una página 404. Ver [navegación y UX](docs/UX.md).

El panel `/studio` ahora comienza en **Trabajos**: solicitud o carga manual → cliente y propiedad → coordinación de visita → editor → publicación → registro de entrega. Ver [guía de operación y cambios](docs/TRABAJOS.md). El sidebar contiene Trabajos, Organizaciones, Particulares y Clientes. Solicitudes web aparece para titulares de estudio y administradores de la plataforma; estos últimos también ven Usuarios registrados y Consultas del sistema. Organizaciones agrupa los recorridos de cada inmobiliaria o empresa; Particulares, los de cada persona contratante. Clientes es una cartera unificada de esas mismas fichas, sin alta independiente. Configuración y sus accesos anteriores están retirados temporalmente; los datos se conservan. Ver el [flujo guiado de seis pasos](docs/UX.md).

En **Entregar → PDF de entrega** se pueden guardar condiciones y contacto para el cliente, revisar un documento con enlace, QR y Google Maps, e imprimirlo o guardarlo como PDF desde el navegador. Requiere la migración aditiva `0018_delivery_document`. Ver [documento de entrega y alcance](docs/PDF_ENTREGA.md).

En **Entregar → Insertar en mi web** se puede copiar un iframe y probar cómo se ve el recorrido dentro de la página del cliente. La ruta pública `/embed/{slug}` muestra el visor sin el logo ni el WhatsApp de Vision360 y mantiene la misma publicación y enlace al actualizar. También está disponible desde Publicación. Ver [integración web](docs/INTEGRACION_WEB.md).

Proyecto incremental según [PLAN.md](PLAN.md): base de Fase 1, visor de Fase 2, identidad/administración de Fase 3, ingestión de Fase 4, editor de Fase 5 y publicación de Fase 6. React + TypeScript + Vite, FastAPI, SQLAlchemy, Alembic y PostgreSQL. Se pueden registrar usuarios y administrar recorridos en borrador y ambientes. La interfaz guiada usa Tailwind CSS; ver [docs/UI.md](docs/UI.md). Ver [Fase 2](docs/FASE2.md), [Fase 3](docs/FASE3.md), [Fase 4](docs/FASE4.md), [Fase 5](docs/FASE5.md) y [Fase 6](docs/FASE6.md).

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

Reemplazar `replace-with-local-password` en `.env` y en `backend/.env` por la misma contraseña local. Podés generar una con `python3 -c 'import secrets; print(secrets.token_hex(24))'`. Una contraseña hexadecimal evita caracteres que necesiten codificarse en la URL; para otras contraseñas, aplicar percent-encoding en `DATABASE_URL`. Generar además un secreto independiente con `python3 -c 'import secrets; print(secrets.token_hex(32))'` y usarlo como `CSRF_SECRET` en backend/.env. El backend rechaza el placeholder del ejemplo.

| Archivo | Variables |
| --- | --- |
| `.env` | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` para Compose |
| `backend/.env` | `APP_NAME`, `DATABASE_URL`, `CORS_ORIGINS` como array JSON de orígenes exactos, `CSRF_SECRET`, `APP_ENV`, `COOKIE_SECURE`, `SESSION_TTL_SECONDS`, storage y límites (ver ejemplos) |
| `frontend/.env` | `VITE_API_BASE_URL` y `VITE_DEMO_MEDIA_BASE_URL` opcional para probar CORS del visor |

El backend carga su `.env` por ruta absoluta, independientemente del directorio desde el cual se importa; las variables del proceso tienen prioridad. `DATABASE_URL` usa `postgresql+psycopg`. Las variables `VITE_*` son públicas: nunca poner secretos allí. En desarrollo, el cliente alinea automáticamente localhost/127.0.0.1 de la API con el hostname del frontend para conservar cookies SameSite. En producción hay que configurar dominios compatibles. CORS debe incluir el origen exacto del frontend.

Durante la implementación se generaron los tres `.env` locales con una contraseña aleatoria compartida, y se añadió un secreto CSRF independiente, sin imprimirlos. En este workspace no hace falta copiarlos nuevamente.

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

Para iniciar **API y worker juntos en una terminal**, con PostgreSQL ya encendido:

```sh
cd /Users/emilianofaro/Desktop/vista360/backend
.venv/bin/python -m app.dev
```

Aplica las migraciones e inicia la API en `127.0.0.1:8001` con recarga y el worker con el mismo `.env`. **Ctrl+C detiene ambos**, incluidos los subprocesos. Si uno termina inesperadamente, se detiene el otro para evitar dejar procesos sueltos. Si el puerto está ocupado, no inicia otra instancia: detener primero la API anterior (y el worker si se inició por separado). El frontend sigue en su propia terminal. Los cambios de código en el worker requieren reiniciar este comando. `--port 8003` permite elegir otro puerto y requiere ajustar la URL del frontend si se usa como backend habitual.

- Healthcheck: <http://localhost:8001/health> → `{"status":"ok"}`.
- Documentación OpenAPI: <http://localhost:8001/docs>.

El healthcheck verifica que el proceso HTTP responde; no consulta PostgreSQL ni garantiza readiness de la base. `python -m app.db.check` ejecuta `SELECT 1` contra la base configurada. Los fallos de conexión hacen que el comando termine con error. SQLAlchemy abre conexiones cuando se necesitan; el arranque HTTP no ejecuta migraciones ni crea tablas automáticamente.

La revisión `0001_base` es vacía; `0002_identity_tours` crea usuarios, sesiones, recorridos y ambientes. `0003_assets` agrega archivos, tareas durables y referencias de panorámicas de ambientes; `0004_hotspots` crea puntos persistentes de navegación e información; `0005_publications` agrega snapshots y retención de assets para publicación. `0006_business` añade organizaciones, membresías, clientes, propiedades y solicitudes/eventos de Studio. `0007_workflow` vincula los trabajos con sus recorridos y añade visita, notas y entrega. `0008_individuals` permite la categoría Particular ampliando la restricción de tipos de organización, sin reclasificar registros. `0009_deletions` agrega marcas de eliminación a clientes y organizaciones para conservar sus trabajos y recorridos. Son ampliaciones de esquema y no trasladan los recorridos personales. Ejecutar `alembic upgrade head` al actualizar. La fábrica de sesiones tiene `pool_pre_ping`, timeout y cierre de recursos al apagar; cada caso de uso controla su transacción.

Para verificar estado y generación de cambios:

```sh
alembic current
alembic check
```

Cuando una fase posterior incorpore modelos, importarlos en `migrations/env.py`, generar una revisión con `alembic revision --autogenerate -m "descripcion"` y revisar el SQL antes de aplicarlo.

## 3. Instalar y ejecutar frontend

En otra terminal, desde la raíz:

```sh
cd frontend
npm ci
npm run dev
```

Abrir <http://localhost:5174/inicio> para la página de presentación de la plataforma. Cada estudio comparte su formulario de solicitudes mediante su enlace o QR propio. El inicio incluye un [formulario de consultas sobre el sistema y WhatsApp del creador](docs/CONTACTO_PLATAFORMA.md). <http://localhost:5174/studio> y <http://localhost:5174> permiten registro/login y administración de recorridos. El visor técnico está en <http://localhost:5174/visor>. El servidor usa puerto fijo y falla si está ocupado, para que CORS no cambie silenciosamente.

Build con verificación TypeScript y previsualización:

```sh
npm run build
npm run preview
```

El build queda en `frontend/dist/` y el preview en <http://localhost:4173>. El visor /visor funciona sin backend ni DB; el panel / sí los necesita. Para usar el panel en preview, añadir su origen a CORS_ORIGINS. La interfaz usa Tailwind CSS 4.3.3 mediante su plugin oficial de Vite; no requiere un servidor de estilos separado. Regenerar tipos HTTP con `npm run generate:api` cuando cambie OpenAPI.

## 4. Ejecutar worker de panorámicas

En una tercera terminal, desde la raíz:

```sh
cd backend
source .venv/bin/activate
python -m app.processing.worker
```

API y worker usan el mismo `backend/.env`, PostgreSQL y directorio de archivos (`backend/.data/assets/` por defecto). Mantener el worker activo para validar cargas y limpiar pendientes. La cola persiste en PostgreSQL al cerrar el proceso; no es necesario Redis.

Abrí un recorrido, agregá un ambiente, seleccioná un JPEG equirectangular completo 2:1 de hasta 50 MiB y pulsá **Subir panorámica**. Al terminar la validación, **Ver panorama** abre su visor privado. La imagen anterior se mantiene durante un reemplazo y si la nueva falla. Los archivos se conservan al cerrar sesión. Para respaldar desarrollo se necesitan tanto la base como el directorio de archivos.

Storage S3/R2 es opcional: `python -m pip install -e '.[s3]' -c requirements.lock`, configurar las variables S3 del ejemplo y un bucket privado con CORS. No se requieren servicios externos para trabajar localmente. Ver los límites y la validación pendiente del proveedor en [FASE4.md](docs/FASE4.md).

## 5. Conectar ambientes y previsualizar

Cargar panorámicas en dos ambientes y pulsar **Conectar Living** (o el nombre elegido). Usar **Ubicar punto**, tocar la imagen, completar etiqueta/destino y **Guardar punto**. Crear otro punto desde Cocina hacia Living para volver. **Guardar vista actual como inicial** conserva la orientación y el zoom. Los puntos de información admiten texto plano.

Al salir del editor, **Previsualizar recorrido** abre el borrador privado desde el ambiente inicial, con conexiones y lista alternativa. Todo persiste al recargar y cerrar sesión. El botón Publicar prepara una versión independiente y habilita `/tour/{slug}` sin login. El enlace local funciona en esta computadora; compartir por Internet requiere despliegue y R2/CDN. Ver [FASE5.md](docs/FASE5.md) para el paso a paso y las confirmaciones de borrado.

## 6. Publicar y compartir

Dentro del recorrido, usar **Publicar recorrido**, revisar advertencias y esperar la versión publicada. **Abrir recorrido público** funciona sin sesión; **Copiar enlace** permite copiar su ruta. Editar el borrador conserva lo publicado hasta pulsar **Publicar cambios**. **Despublicar recorrido** retira el tour público y programa limpieza de imágenes.

Para agregar una ubicación exacta y el botón público **Cómo llegar**, ver [Ubicación de los recorridos](docs/UBICACION_RECORRIDOS.md). La ubicación se configura de forma explícita y se incluye al publicar; no usa las direcciones internas del cliente.

Se requiere el worker activo. En local se usan copias separadas bajo `.data/assets/_public`, sólo para pruebas. En S3/R2 configurar un bucket público separado y `PUBLIC_MEDIA_BASE_URL`; las imágenes públicas se sirven por el dominio de medios, sin pasar por la API en producción. Ver [FASE6.md](docs/FASE6.md) para configuración, límites y validación externa pendiente. El slug se conserva desde la primera publicación exitosa.

## Verificaciones realizadas

La evolución Studio/Platform incorpora pruebas de aislamiento entre organizaciones, revocación, roles, límites compartidos y concurrentes, solicitudes privadas y transiciones auditadas, además del flujo de cartera y colaboración en navegador. Los resultados y comandos están en [EVOLUCION.md](docs/EVOLUCION.md#verificación-y-límites).

Se comprobaron en este entorno:

- Instalación del frontend desde lockfile, TypeScript estricto y build Vite.
- Arranque de Uvicorn y respuesta HTTP real del healthcheck.
- Conexión real de SQLAlchemy/Psycopg al PostgreSQL de Compose.
- Upgrade, revisión activa, `alembic check`, downgrade y upgrade de la migración base.
- Migración de la Fase 3 y permisos/CRUD sobre PostgreSQL real, incluidos casos concurrentes.
- Compatibilidad de dependencias Python mediante `pip check`.

Para repetir las verificaciones con backend iniciado, ejecutar `curl --fail http://localhost:8001/health`, `python -m app.db.check` y `alembic check` desde backend, y `npm run build` desde frontend.

## Detener servicios

Ctrl+C detiene frontend, backend y worker en sus respectivas terminales. Desde la raíz, `docker compose stop db` detiene PostgreSQL conservando contenedor y datos; `docker compose down` retira contenedor/red y conserva el volumen. No usar la opción `--volumes` salvo que quieras borrar la base local.

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
- En Fase 3 se habilitaron credenciales y métodos de mutación, con Origin exacto y challenge CSRF firmado. Producción requiere cookies Secure y orígenes HTTPS.

El cierre técnico del visor de Fase 2 fue aprobado para continuar, manteniendo pendientes de dispositivos/fotografías reales. La Fase 3 incorpora auth y CRUD, documentados en [docs/FASE3.md](docs/FASE3.md), junto con comandos para pruebas aisladas. La Fase 4 agrega cargas, validación y visor privado de cada panorama; ver [docs/FASE4.md](docs/FASE4.md). La Fase 5 incorpora edición persistente y previsualización privada; ver [docs/FASE5.md](docs/FASE5.md). La Fase 6 incorpora publicación versionada y vista pública; ver [docs/FASE6.md](docs/FASE6.md). La Fase 7 requiere aprobación antes de iniciarse.

Consultas del sitio: [bandeja privada y configuración de avisos por email](docs/SOLICITUDES_WEB.md).

La [seguridad de cuentas](docs/SEGURIDAD_CUENTAS.md) incluye recuperación/cambio de contraseña, verificación de email y límites persistentes. Con el remitente de prueba, mantener `AUTH_REQUIRE_VERIFIED_EMAIL=false` hasta habilitar el envío a todos los usuarios.

El perfil privado se administra desde [Mi cuenta](docs/MI_CUENTA.md): foto, nombre, tipo de cuenta, teléfono, email y contraseña.

La administración de la plataforma tiene un [directorio privado de usuarios registrados](docs/USUARIOS_REGISTRADOS.md), con totales, búsqueda y datos de contacto. Requiere `PLATFORM_ADMIN_USER_IDS`; no se mezcla con los clientes de cada estudio.

En **Administración → Consultas del sistema** se pueden consultar los [mensajes del formulario de inicio](docs/CONTACTO_PLATAFORMA.md), con email, teléfono y acciones para llamar o responder. La bandeja incluye las consultas guardadas antes de esta actualización y requiere los mismos permisos de administración.

La [base de suscripciones](docs/SUSCRIPCIONES.md) incorpora prueba de 14 días, Profesional y Estudio, consulta en Mi cuenta y asignación manual con historial desde administración. Sin cobros automáticos; los límites comerciales permanecen desactivados por defecto.

Los [planes también aparecen en el inicio](docs/SUSCRIPCIONES.md#planes-en-el-inicio-y-elección-antes-del-registro): elegir uno abre el registro si no hay sesión y conserva la elección al ingresar, sin activar cobros ni modificar automáticamente la suscripción.

La prueba gratuita se activa al registrarse sin tarjeta ni aprobación; las cuentas anteriores elegibles pueden activarla directamente desde Mi plan. Conserva sus 14 días originales y no se reinicia al volver a elegirla.

La interfaz ofrece [español y portugués de Brasil](docs/IDIOMAS.md), con selector de idioma y preferencia guardada en el navegador. Los textos cargados por los usuarios conservan su idioma original.
