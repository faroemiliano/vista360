# Vision360 — auditoría y evolución incremental

Este documento registra la primera entrega Studio/Platform. La evolución posterior que conecta solicitud, trabajo, cliente, propiedad, recorrido y entrega está en [TRABAJOS.md](TRABAJOS.md) y reemplaza los pendientes de vinculación de esa primera entrega.

## Auditoría del repositorio

Monorepo existente Vista360: React 19 + TypeScript 5.9 + Vite 8, Tailwind 4.3, Pannellum mediante adaptador; FastAPI, SQLAlchemy síncrono/Psycopg, Alembic, PostgreSQL. Sesiones opacas en cookie HttpOnly, Argon2, Origin/CSRF y permisos por owner_id. Assets privados validados por worker durable en PostgreSQL; derivados, cuotas, reemplazos, cleanup. Hotspots y orientación persistentes. Snapshots versionados, revisión concurrente, retención de assets, vista pública, republicación/despublicación y transición visual entre fotos.

Las migraciones 0001–0005 y los datos actuales se conservan. Hay código de fases anteriores sin commit: no se descarta ni se atribuye a esta entrega. `/` es el panel/login, no una landing comercial. `/visor` usa grillas sintéticas; no demuestra una propiedad real. `/tour/{slug}` sólo entrega publicaciones aprobadas. R2/CDN tiene adaptador y pruebas controladas, pero no configuración/validación real. El enlace localhost aún no es compartible por Internet.

Faltan organizaciones/membresías, permisos por rol, propiedades/clientes, solicitud comercial, operación de Studio, landing, colaboradores y límites por organización. No existen planes comerciales activos, cobros, métricas de visualización, portfolios, marketplace, 3D ni captura móvil. Los usuarios no verifican email todavía; no se deben conceder permisos por un email declarado sin verificar.

Reutilizar: módulos de dominio, Settings, sesiones/CSRF, servicios de tour/asset, worker, snapshot público, formularios/guía/Tailwind, tipos OpenAPI y tests reales de PostgreSQL/navegador. La evolución no necesita microservicios, otro visor, Redis ni nuevas dependencias.

## Riesgos y decisiones

- La autorización debe resolverse en backend. Organizaciones y membresías múltiples, no un único organization_id en users. Una membresía habilita sólo su organización. El creador de un tour organizacional no conserva acceso al salir del equipo.
- Propiedades y tours tienen una organización responsable; colaboradores trabajan mediante membresías explícitas, sin duplicar entidades. Compartir un mismo proyecto entre organizaciones diferentes necesita una concesión específica futura; no se copian registros para simularlo.
- Las cuotas deben agregarse por organización y bloquear su fila al reservar, para evitar bypass entre distintos colaboradores.
- Roles globales y de organización son distintos. Administradores de plataforma se habilitan mediante UUIDs configurados por el operador; registrarse o declarar un email no concede administración. No se asigna un administrador real sin intervención del operador.
- Solicitudes públicas contienen datos de contacto: sólo administración autorizada puede consultarlas. CSRF, validación, recepción idempotente y límite por IP/proceso. Límite compartido/antibot y protección de borde pendientes antes de exposición pública.
- Separar solicitudes de servicio de publicaciones: un trabajo puede cancelarse sin borrar el recorrido; publicar un tour no debe cobrar, aprobar ni finalizar un trabajo automáticamente.
- Marca comercial del documento: Vision360. Conservar nombres técnicos de repo, DB, cookies y claves existentes. No renombrar infraestructura.
- `/inicio` añade la landing y `/studio` permite abrir el panel sin sustituir `/`. Antes de convertir `/` en landing o trasladar recorridos personales, pedir confirmación con una migración de datos revisable, backup y prueba de restauración.

## Plan y criterios de aceptación

| Etapa | Prioridad / alcance | Archivos y datos | Criterio |
| --- | --- | --- | --- |
| A — comercial | Landing Studio/Platform/Network, planes sin precios, contacto real | frontend/features/commercial, App, index.html; service_requests y eventos en migración aditiva | CTA envía y persiste una solicitud; Network marcado Próximamente, ninguna demo o testimonio inventado |
| B — operación Studio | Bandeja y transiciones auditadas, acceso de administrador | backend/modules/studio y panel compartido | Sólo UUIDs administrativos configurados consultan solicitudes; transiciones inválidas rechazadas; no envíos externos ni pagos |
| C — organizaciones | Organizaciones, membresías múltiples owner/admin/editor/viewer, límites configurables | backend/modules/organizations, Settings, migración aditiva | Un usuario colabora con varias organizaciones; aislamiento API/DB; viewer no escribe y miembro revocado pierde acceso |
| D — cartera y editor | Clientes, propiedades, tours vinculados a organización/propiedad; reutilizar editor | backend/modules/properties, tours/assets y frontend/features/business | Crear y editar sin duplicar entidades; cuotas por organización; recorridos personales y snapshots anteriores siguen funcionando |
| E — conversión aprobada | Migrar tours personales a organización elegida; decidir raíz comercial | Migración de datos separada y routing | Requiere confirmación; dry-run, backup, conteos y permisos antes/después. No incluida sin aprobación |
| F — entrega comercial | Datos públicos seleccionados, WhatsApp, marca, embed, portfolios, métricas | snapshots versionados + políticas públicas; cambios compatibles | Sin PII interna; borrador aislado; embed/CSP/cookies probados; métricas sin datos inventados |
| G — monetización | Catálogo gratuito/pro/inmobiliaria/empresa, límites y suscripciones | módulo de planes y registro de asignaciones | Precios y activación comercial aprobados, ningún cobro real en esta etapa |
| H — Network | Solicitudes/asignación/disponibilidad/presupuestos/comisiones/valoraciones | servicios independientes sobre organizaciones, propiedades y trabajos | Diseñar tras uso real de Studio/Platform; no marketplace simulado |

La primera entrega ejecuta A–D de forma compatible y aditiva. No convierte datos existentes, no cambia infraestructura, no integra pagos ni reemplaza la ruta raíz. El traslado de datos y el rol administrativo de una cuenta concreta quedan para confirmación posterior. Comprobar tests PostgreSQL, permisos, validaciones, migraciones en DB temporal, tipos y build; indicar ausencia de lint configurado. Revisar móvil y escritorio. La preparación productiva sigue pendiente de despliegue/R2, email verificado, backups, límite distribuido y validación física.

## Resultado implementado

- Landing comercial responsive con hero, soluciones, proceso, públicos, estructura de planes sin precios y formulario real. Network figura como Próximamente. La demostración enlaza al visor técnico de grillas y se identifica como tal; no presenta una propiedad ficticia. Metadatos básicos en HTML; prerender/SSR y SEO por publicación pendientes.
- Solicitudes persistidas con validación, consentimiento, honeypot, CSRF/Origin, referencia idempotente y límite de cinco intentos por IP/proceso cada diez minutos. Respuesta pública limitada a una referencia; consulta y contactos sólo para administración. No se envían emails ni mensajes de WhatsApp automáticamente.
- Bandeja administrativa paginada, cambios de estado válidos, control de actualización concurrente e historial con actor, nota y fecha. Los estados son operativos y manuales: marcar PUBLICADO no publica un tour ni ejecuta un cobro.
- Organizaciones de tipo inmobiliaria, fotógrafo, empresa o Studio propio; el tipo Studio requiere administración global. Roles owner/admin/editor/viewer, varias membresías por persona, gestión del equipo y protección del último propietario. Colaboración mediante cuentas ya registradas; no hay invitaciones por email.
- Crear y editar clientes y propiedades; asociar cliente a propiedad, crear recorridos vinculados y reutilizar el editor, uploads, hotspots, preview y publicación existentes. Un viewer sólo puede leer y previsualizar. Fotografías, recorridos y clientes se aíslan por membresía en backend. Datos internos de la propiedad no se incorporan automáticamente al snapshot público.
- Límites iniciales configurables de recorridos, miembros y almacenamiento por organización. Reservas y escrituras bloquean la organización para serializar cuotas entre colaboradores. Administración puede ajustar límites por API, sin bajarlos por debajo del uso/reserva. No son suscripciones comerciales ni habilitan compras.

### Archivos de esta evolución

| Área | Archivos creados o adaptados |
| --- | --- |
| Backend nuevo | `backend/app/modules/organizations/{models,schemas,service,router}.py`, `properties/{models,schemas,service,router}.py`, `studio/{models,schemas,service,router}.py`, con sus `__init__.py` |
| Backend integrado | `backend/app/main.py`, `core/config.py`, `modules/auth/security.py`, `modules/tours/{models,schemas,service}.py`, `modules/assets/service.py`, `processing/worker.py` |
| Base/configuración | `backend/migrations/env.py`, `backend/migrations/versions/0006_studio_organizations_properties.py`, `backend/.env.example` |
| Frontend nuevo | `frontend/src/features/commercial/{Landing,ServiceForm}.tsx`, `frontend/src/features/business/{OrganizationsPanel,StudioPanel}.tsx`, `frontend/src/api/business.ts` |
| Frontend integrado | `frontend/index.html`, `frontend/src/app/{App,Workspace}.tsx`, `features/tours/ToursPanel.tsx`, `api/{client.ts,schema.d.ts}` y textos de marca de componentes existentes |
| Pruebas/documentación | `backend/tests/{conftest,test_phase3,test_business,test_browser}.py`, `frontend/tests/business.spec.ts`, `README.md`, `docs/EVOLUCION.md` |

Los cambios de fases anteriores (Tailwind, editor, storage, publicaciones y sus dependencias) ya estaban en el workspace. Esta evolución no agrega paquetes ni reescribe su arquitectura.

### Base de datos

Revisión `0006_business`, posterior a `0005_publications`, aplicada al PostgreSQL local. Crea `organizations`, `organization_memberships`, `business_clients`, `properties`, `service_requests` y `service_request_events`. Añade a `tours` los campos opcionales `organization_id` y `property_id`, con claves foráneas que impiden asociar propiedades de otra organización. Los registros previos permanecen personales y las publicaciones se conservan.

Sólo se ejecutó una ampliación de esquema en la base de desarrollo. Las pruebas de downgrade/upgrade y datos de prueba usan bases temporales separadas; no se borraron datos del usuario ni se ejecutó una conversión de registros existentes. El FK histórico de creador de tour hacia usuario se conserva: antes de incorporar borrado de cuentas debe definirse qué ocurre con sus tours organizacionales.

### API

Las rutas de esta tabla son relativas al prefijo `/api/v1` (por ejemplo, `/api/v1/organizations`).

| Método y ruta | Uso |
| --- | --- |
| `GET /business/access` | Capacidades globales de la sesión |
| `GET`, `POST /organizations` | Mis organizaciones / crear organización |
| `GET`, `PUT /organizations/{id}/members` | Consultar equipo / incorporar o actualizar rol |
| `DELETE /organizations/{id}/members/{user_id}` | Revocar acceso |
| `GET`, `POST /organizations/{id}/clients` | Listar y crear clientes |
| `PUT /organizations/{id}/clients/{client_id}` | Editar cliente |
| `GET`, `POST /organizations/{id}/properties` | Listar y crear propiedades |
| `PUT /organizations/{id}/properties/{property_id}` | Editar propiedad |
| `GET`, `POST /organizations/{id}/tours` | Listar y crear recorridos organizacionales |
| `PUT /organizations/{id}/tours/{tour_id}/property` | Cambiar asociación a propiedad dentro de la organización |
| `PUT /admin/organizations/{id}/limits` | Límites, sólo administrador de plataforma |
| `POST /service-requests` | Recepción pública protegida por CSRF |
| `GET /admin/service-requests?limit=50&offset=0` | Bandeja privada, máximo 100 por página |
| `PUT /admin/service-requests/{id}/status` | Transición con estado esperado y nota |
| `GET /admin/service-requests/{id}/events` | Historial privado |

`GET /tours` sigue listando recorridos personales. Las rutas existentes `/tours/{id}`, escenas, assets, hotspots y publicaciones aplican además la membresía cuando el tour pertenece a una organización. El creador pierde acceso si se revoca su membresía. Ser administrador global no concede acceso automático a contenido privado de organizaciones ajenas.

### Variables de entorno

En `backend/.env.example`, con valores por defecto operativos sin secretos:

```dotenv
PLATFORM_ADMIN_USER_IDS=[]
ORGANIZATION_TOUR_LIMIT=10
ORGANIZATION_MEMBER_LIMIT=10
ORGANIZATION_STORAGE_QUOTA_BYTES=5368709120
```

Los límites inicializan organizaciones nuevas; cambiar el entorno no modifica límites ya guardados. Para habilitar la bandeja Studio hay que seleccionar una cuenta existente, obtener su UUID desde `GET /api/v1/auth/session` con esa sesión y configurar `PLATFORM_ADMIN_USER_IDS=["UUID-DE-LA-CUENTA"]` en el entorno privado del backend. Reiniciar la API. No usar un email como identificador ni publicar el `.env`. Ninguna cuenta real fue promovida en esta entrega; los administradores de navegador se crean sólo en la base temporal.

### Probar manualmente

1. Mantener PostgreSQL y los tres procesos de desarrollo según README: API `uvicorn app.main:app --reload --host 127.0.0.1 --port 8001`, frontend `npm run dev`, worker `python -m app.processing.worker`. Aplicar `alembic upgrade head` al instalar esta revisión en otra copia.
2. Abrir `http://localhost:5174/inicio`, completar la solicitud y comprobar su referencia. La recepción persiste en DB, sin envío externo.
3. Entrar en `http://localhost:5174/studio`, abrir Organizaciones y crear una inmobiliaria o estudio de fotografía. Registrar un cliente, una propiedad y su recorrido. Subir un JPEG panorámico 2:1 y usar el editor existente.
4. Registrar otra cuenta, incorporarla desde Colaboradores y elegir editor o viewer. Iniciar sesión con esa cuenta y abrir la misma organización: trabaja sobre el mismo recorrido, sin copias. El viewer sólo previsualiza.
5. Tras configurar explícitamente el UUID administrativo, entrar nuevamente y abrir Solicitudes Studio. Consultar contactos y avanzar el trabajo con notas. Para gestionar cartera propia, esa cuenta puede crear una organización Studio; la bandeja de solicitudes y los recorridos todavía no se vinculan automáticamente.

## Verificación y límites

Resultado final de esta entrega: **69 tests pytest pasaron** en 132,62 s, incluido el runner de navegador. Ese runner ejecutó **33 casos Playwright correctos y 1 omitido intencionalmente**: el gesto táctil mediante CDP se ejecuta en móvil y se omite en el proyecto desktop. Sin fallos finales. Se corrigió durante la revisión una aserción del test que buscaba el teléfono como texto independiente aunque la tarjeta lo muestra junto al email; se volvió a ejecutar toda la suite.

`npm run generate:api`, TypeScript y build Vite correctos. `pip check` sin incompatibilidades; conexión real `SELECT 1` correcta; Alembic en `0006_business (head)` y `alembic check` sin cambios pendientes. API `/health` y frontend `/inicio` respondieron HTTP 200. API, frontend y worker locales se dejaron activos.

En la revisión visual final se ajustó el selector de estados de Studio para exigir una elección explícita y limpiar la nota después de cada transición; así el navegador no selecciona CANCELADO al retirar una opción anterior. Se repitió ese flujo en desktop/móvil (2 casos Playwright, runner pytest correcto) y el build, ambos correctos.

Pruebas con PostgreSQL real en bases temporales: aislamiento API y claves foráneas entre organizaciones; roles y revocación, incluso del creador; protección del último owner; cuotas de tours concurrentes y almacenamiento agregado entre creadores; permisos sobre media privada; límites administrativos; solicitudes anónimas/idempotencia, CSRF, validación, rate limit, privacidad e historial. Se mantienen las pruebas anteriores de autenticación, uploads, worker, hotspots y publicaciones.

Comandos desde `backend/` (entorno virtual ya instalado):

```sh
.venv/bin/python -m pip check
.venv/bin/python -m app.db.check
.venv/bin/alembic current
.venv/bin/alembic check
RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome .venv/bin/python -m pytest -q
```

Desde `frontend/`: `npm run generate:api` y `npm run build` (incluye TypeScript). El runner de navegador arranca API/worker/frontend temporales y prueba desktop y móvil emulado. Chrome debe estar instalado. Los tests requieren Node compatible y permiso para crear una DB temporal en el PostgreSQL configurado. No hay script de lint configurado en este repositorio. La dependencia Starlette emite un aviso de deprecación de TestClient/httpx; no bloquea los tests y no se cambiaron dependencias para ocultarlo.

Se revisaron landing y formulario a 1440, 393 y 320 px sin desbordamiento horizontal. Safari/WebKit no puede verificarse con el entorno instalado de macOS; dispositivos físicos, despliegue externo y R2/CDN real siguen pendientes. La landing es SPA con metadatos básicos, no una solución completa de SEO por tour.

## Siguientes etapas

1. Elegir y autorizar la cuenta operadora de Studio. Cargar una solicitud y una propiedad reales para validar la operación, sin cobros ni contactos automáticos.
2. Definir si se quieren convertir tours personales a organizaciones concretas y cambiar `/` a landing. Antes de esa conversión: preparar dry-run, revisión de permisos/conteos, backup y restauración probada; solicitar aprobación.
3. Asociar cada solicitud con cliente, propiedad y recorrido, añadir coordinación/entrega, información pública seleccionada, marca/logo, WhatsApp, embed y portfolio. Diseñar métricas reales y administración global de usuarios/planes; no hay datos simulados para esas funciones.
4. Preparar operación pública: email verificado, invitaciones aceptadas, privacidad, límite distribuido, backups, despliegue, dominio, bucket/CDN y SEO. Las URLs locales todavía no se comparten por Internet.
5. Catálogo y asignación de planes tras definir condiciones comerciales. Pagos, comisiones, disponibilidad, asignaciones y valoraciones de Network continúan fuera de esta entrega.
