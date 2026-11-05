# Fase 3 — Identidad y administración de recorridos

Alcance: registro/login/logout, sesiones, permisos por propietario, recorridos en borrador y metadatos de ambientes. La UI sigue siendo una base funcional; su diseño definitivo se realizará después. No hay uploads, assets, hotspots persistentes, publicación ni pagos.

## Usar la aplicación

Desde la raíz:

```sh
docker compose up -d --wait db
```

En una terminal:

```sh
cd backend
source .venv/bin/activate
python -m pip install -e '.[dev]' -c requirements.lock
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

En otra:

```sh
cd frontend
npm ci
npm run dev
```

Abrir http://localhost:5174. Crear cuenta, crear un recorrido y abrirlo. Se pueden editar título, slug y descripción; agregar, renombrar, eliminar y ordenar ambientes; guardar orientación inicial y elegir ambiente inicial. El primer ambiente pasa a ser inicial automáticamente. Al eliminarlo se elige el primero restante o NULL si no quedan ambientes.

Los datos quedan en PostgreSQL y sobreviven a recargas y reinicios. El visor técnico sigue disponible en `/visor`, sin login ni necesidad de backend; sus datos siguen siendo fixtures separadas y no representan un tour persistente. No existe todavía una URL pública del recorrido.

En desarrollo, cuando la URL API y el frontend usan localhost/127.0.0.1, el cliente alinea automáticamente el hostname de la API con el del frontend, conservando puerto y path. Así se evita perder cookies SameSite al abrir el enlace 127.0.0.1 mostrado por Vite con una API configurada localhost. La URL API sigue siendo configurable con `VITE_API_BASE_URL`; hosts remotos y builds de producción se respetan tal como se configuran. CORS debe incluir el origen frontend exacto.

## Configuración y seguridad implementada

Se añadieron a `backend/.env.example`:

- `CSRF_SECRET`: secreto aleatorio obligatorio de al menos 32 caracteres, sin aceptar placeholders. En el workspace ya se generó y guardó en `.env`, sin imprimirlo. En una instalación nueva, generar un secreto propio y reemplazar el ejemplo.
- `APP_ENV`: development/test/production.
- `COOKIE_SECURE`: false sólo para HTTP local. Producción exige true, orígenes HTTPS explícitos y usa nombres `__Host-` sin Domain, con Path=/.
- `SESSION_TTL_SECONDS`: 604800 por defecto (7 días), configurable.

Contraseñas con Argon2id mediante argon2-cffi, parámetros recomendados de la librería; rehash al login cuando cambia la configuración. Política inicial de 12–128 caracteres. Emails validados y normalizados sin distinguir mayúsculas/minúsculas. No se consulta un servicio de email para registrar.

Las sesiones usan 32 bytes aleatorios; sólo su hash SHA-256 se almacena en DB. La cookie de sesión es HttpOnly y SameSite=Lax, Secure en producción. Login/register rotan la sesión del navegador y revocan la anterior; logout revoca en DB, borra cookies e impide reutilizar el token. La expiración se verifica en cada acceso protegido. El frontend no guarda tokens de sesión ni contraseñas en localStorage.

CSRF: GET `/api/v1/auth/session` devuelve usuario o NULL y un challenge. Su cookie HttpOnly y header `X-CSRF-Token` deben coincidir. El challenge está firmado con HMAC-SHA256, vinculado a la sesión (o al contexto anónimo previo al login), y las mutaciones también exigen Origin dentro de la lista exacta. Se mantienen challenges válidos al consultar sesión; no se invalidan innecesariamente entre pestañas. Las respuestas privadas llevan `Cache-Control: no-store`.

Los errores de validación no devuelven el contenido enviado: no se refleja una contraseña inválida en la respuesta. Los schemas de entrada rechazan campos adicionales como owner_id; el propietario se toma de la sesión. Usuario inexistente y contraseña incorrecta producen el mismo error de login y ambos ejecutan una verificación de hash.

Límite básico de login/registro: 30 intentos cada 10 minutos por IP y proceso. Es una medida inicial en memoria, no un límite distribuido; reiniciar un proceso reinicia su contador. El despliegue productivo deberá configurar límites compartidos/edge y proxies confiables en la fase de preparación productiva.

Referencias: [Argon2](https://argon2-cffi.readthedocs.io/en/stable/howto.html) y [prevención CSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). La firma se vincula a la sesión y se combina con comprobación de Origin, cookies y CORS.

## Persistencia y permisos

La revisión `0002_identity_tours` crea únicamente `users`, `auth_sessions`, `tours` y `scenes`, con UUIDs, timestamps UTC, índices y constraints. No agrega entidades de fases posteriores ni columnas apuntando a tablas inexistentes.

El estado del recorrido es draft. Slug ASCII minúsculo con guiones e índice UNIQUE global; colisiones concurrentes devuelven 409. El usuario puede editarlo porque aún no hay publicación. La API devuelve 404 tanto para un recurso ajeno como para uno inexistente, y lista sólo los recorridos propios.

Todas las operaciones de escenas pasan primero por autorización del tour. El FK compuesto de escena inicial exige que escena y tour coincidan también en la base. El orden tiene unicidad diferible dentro del recorrido; la operación recibe todos sus IDs exactamente una vez y guarda el cambio completo en una transacción. Mutaciones de escenas bloquean el tour para serializar creación/reordenamiento y actualizan su revisión. Límite inicial: 1000 escenas por recorrido, revisable.

Eliminar un tour limpia su referencia inicial y elimina sus escenas por cascade. La UI solicita confirmación para borrar. No hay borrado de archivos porque aún no hay uploads. Los casos de uso están en servicios; handlers HTTP, schemas y modelos se mantienen en módulos separados.

## API disponible

| Método | Ruta bajo `/api/v1` | Operación |
| --- | --- | --- |
| GET | `/auth/session` | Bootstrap CSRF y usuario actual |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Identidad y sesión |
| GET/POST | `/tours` | Listar propios / crear |
| GET/PUT/DELETE | `/tours/{tour_id}` | Consultar / editar / eliminar |
| PUT | `/tours/{tour_id}/start-scene` | Elegir ambiente inicial del mismo tour |
| GET/POST | `/tours/{tour_id}/scenes` | Listar / agregar ambientes |
| PUT | `/tours/{tour_id}/scenes/order` | Reordenar lista completa |
| PUT/DELETE | `/tours/{tour_id}/scenes/{scene_id}` | Editar / eliminar ambiente |

`/health` sigue siendo liveness básico. Ver el contrato y probar endpoints en http://localhost:8001/docs. Clientes HTTP manuales deben obtener primero cookies/challenge de sesión y enviar Origin + X-CSRF-Token en mutaciones.

El frontend usa fetch con credentials y tipos generados desde OpenAPI en `src/api/schema.d.ts`. Para regenerar, desde frontend: `npm run generate:api`. Requiere el entorno virtual backend instalado y configuración válida, pero no conexión a PostgreSQL. El JSON temporal se ignora en Git.

Decisión de compatibilidad: el generador openapi-typescript 7.13.0 declara soporte de TypeScript 5; se alineó el compiler a 5.9.3, manteniendo compilación estricta y sin forzar peer dependencies. El generador y Playwright son herramientas de desarrollo, sin código adicional en el bundle de producto. No se agregó un router: las dos entradas actuales `/` y `/visor` no lo necesitan; vistas de detalle usan estado React por ahora.

## Verificación reproducible

Pruebas backend, desde backend con venv activo:

```sh
python -m pip install -e '.[dev]' -c requirements.lock
python -m pytest -q
```

El fixture exige PostgreSQL local y crea una DB efímera con nombre aleatorio terminado en `_test`. Aplica migraciones reales, vacía sólo esa DB entre casos y la elimina al terminar; no limpia datos de desarrollo. Requiere permiso CREATE DATABASE, disponible en el PostgreSQL local de Compose.

Suite completa con navegador (seleccionar antes Node compatible):

```sh
cd frontend
npx playwright install chromium
cd ../backend
RUN_BROWSER_TESTS=1 python -m pytest -q
```

En este equipo se usó `PLAYWRIGHT_CHANNEL=chrome` junto con RUN_BROWSER_TESTS=1 para aprovechar Chrome instalado. El test backend proporciona su DB temporal al runner frontend; Playwright levanta API real en 8002, Vite en 5176 y medios en 5175, y los detiene al terminar. No crea cuentas de prueba en la base de desarrollo.

Cobertura: hash/cookies, normalización y duplicados de email, errores de login, rotación/revocación/expiración, CSRF ausente/forjado/malformado/vinculado a otra sesión, Origin, CORS con credenciales, respuestas sin secretos, validación y rechazo de campos adicionales, CRUD, escena inicial, eliminación en cascade, orden completo transaccional, usuarios aislados, referencias cruzadas rechazadas en API/DB, concurrencia de slug y creación de escenas, throttling, configuración productiva/cookies Secure y round-trip de migraciones.

El flujo en navegador comprueba registro, creación/edición de ambientes, reordenamiento, elección inicial, persistencia tras recarga, eliminación, logout y nuevo login. Se ejecuta en Chrome escritorio y viewport móvil; la suite del visor también se conserva.

Resultado local del 13/10/2026: **24 pruebas pytest aprobadas**, incluida la orquestación del navegador contra API y PostgreSQL reales. El runner frontend ejecuta 21 casos aprobados y una omisión intencional (gesto CDP fuera del proyecto móvil). TypeScript estricto, build Vite, pip check, conexión PostgreSQL, migración activa `0002_identity_tours`, ausencia de drift de Alembic y upgrade/downgrade/upgrade aprobados. La DB de desarrollo quedó sin cuentas ni recorridos de prueba.

La dependencia fijada Starlette emite un aviso de deprecación por el transporte httpx del TestClient; no afecta la suite ni el runtime del producto. Las herramientas de test deberán actualizarse de manera coordinada en mantenimiento.

## Límites y próximo paso

El cierre técnico de Fase 2 permite continuar por autorización del usuario; no convierte en aprobadas las pruebas físicas pendientes. Safari, fotos reales y GPU móvil siguen pendientes según FASE2.md. La UI definitiva está pospuesta.

Esta fase no incluye recuperación/verificación de email, gestión multiempresa, roles, sesiones de otros dispositivos, paginación avanzada ni despliegue productivo. Medir parámetros de hashing y concurrencia, establecer límites compartidos, limpieza de sesiones expiradas y límites de requests antes de producción. La base actual es para seguir construyendo y probando localmente.

La Fase 4 será ingestión de panoramas: assets, carga, validación, almacenamiento y reemplazo. No se implementa en esta entrega.
