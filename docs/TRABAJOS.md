# Operación de Vision360 por trabajos

Esta entrega conecta el pedido con el trabajo operativo, su cliente, propiedad, recorrido y entrega. Reutiliza el editor y las publicaciones existentes. No implementa pagos, calendarios externos ni envío automático de mensajes.

## Navegación

`/` y `/studio` abren **Trabajos** después de iniciar sesión. El sidebar contiene **Trabajos, Organizaciones, Particulares y Clientes**. Organizaciones y Particulares abren los recorridos por contratante y permiten preparar trabajos en ese espacio. Configuración y sus accesos al flujo anterior están retirados temporalmente, incluida la bandeja Solicitudes Studio, sin borrar datos. Los permisos y la organización activa se mantienen. Ver [la guía de UX actual](UX.md).

Una inmobiliaria registrada como cliente no necesita una cuenta para ver su recorrido público. En el flujo por contratante se usa una organización por inmobiliaria o empresa y una ficha en Particulares por persona. Los espacios de estudio anteriores siguen disponibles con sus datos.

## Crear y operar un trabajo

1. **Datos:** seleccionar una organización propia y pulsar Nuevo trabajo. El cliente es la organización o el particular elegido. Completar los datos de contacto o elegir uno guardado, junto con el inmueble. Usar una propiedad o recorrido existente queda dentro de una opción desplegable. Guardar y abrir trabajo crea lo que falte en una transacción con los permisos y cuotas existentes.
2. **Visita:** guardar fecha local y notas; confirmar explícitamente el trabajo cuando corresponda. Continuar a fotos. Las acciones no agendan eventos externos ni envían mensajes.
3. **Fotos:** agregar ambientes, subir panorámicas y elegir el inicio. Continuar a conexiones cuando estén validadas todas las fotos.
4. **Conexiones:** abrir un ambiente, ubicar y guardar sus puntos. La lista visible permite editarlos y eliminarlos. Crear también la vuelta abre el destino y exige ubicar el regreso; reutiliza el punto si ya existe. Se guarda sólo al confirmar Guardar punto.
5. **Revisar:** previsualizar ida y vuelta, publicar y obtener el enlace. La API valida la publicación y advierte sobre ambientes inaccesibles por conexiones. El enlace local se distingue de uno disponible por Internet.
6. **Entregar:** continuar a entrega, revisar/copiar el enlace y pulsar Marcar como listo para entregar si el trabajo aún no está PUBLICADO. Escribir el detalle, confirmar que se compartió y Registrar entrega y finalizar. Se conservan operador, fecha, versión e historial. No se envía el enlace automáticamente.

Cambiar estado del trabajo y su historial están desplegables. Los ocho estados siguen disponibles, sin exigir un orden: SOLICITADO, PRESUPUESTADO, CONFIRMADO, EN_PRODUCCION, EN_REVISION, PUBLICADO, FINALIZADO y CANCELADO. Se pueden reabrir trabajos. PUBLICADO requiere publicación vigente sin cambios pendientes; FINALIZADO también requiere una nota de entrega. Cambiar de estado no publica por sí mismo. La cabecera muestra por separado el estado del trabajo y del recorrido.

La fecha y las notas operativas no se editan mientras el trabajo está cancelado o finalizado; el selector de estados sigue disponible para reabrirlo. La última entrega registrada se conserva como antecedente al reabrir y una entrega posterior actualiza su fecha y versión; los eventos anteriores permanecen en el historial. El recorrido sigue siendo editable por sus roles habituales; publicar cambios conserva el mismo enlace. Si se despublica después de entregar, se conserva el historial y la pantalla informa que ya no hay enlace activo.

Los recorridos asociados a trabajos no pueden borrarse ni cambiar de propiedad; las propiedades vinculadas no pueden cambiar de cliente. Esto conserva el historial y evita entregas sin recorrido. No se agregó borrado de trabajos ni transferencia de datos. Cualquier política futura de archivo/retención debe tratarse expresamente.

## Solicitudes web y permisos

La solicitud pública y el trabajo usan el mismo registro, con referencias opcionales. Preparar el trabajo añade la vinculación y un evento, sin copiar la solicitud ni trasladar datos anteriores. Un trabajo manual tiene origen `manual` y no aparece como lead en la bandeja global web.

- Owner, admin y editor de la organización pueden operar sus trabajos.
- Viewer puede consultar el trabajo, historial y preview, sin modificar ni registrar entregas.
- Un usuario ajeno o revocado no accede a trabajos de esa organización.
- La administración global habilita la bandeja web; no reemplaza la membresía para trabajar con contenido de una organización.
- Los datos de contacto, visita, notas y entrega son privados; no se agregan al snapshot público.

Por indicación del usuario se habilitó `farixio.tech@gmail.com` como administrador en la configuración **local privada**, mediante su UUID en `PLATFORM_ADMIN_USER_IDS`. La API se recargó para tomarlo. No se incluyeron identificadores ni secretos de esa cuenta en `.env.example`.

## Cambios técnicos

Migración aditiva `0007_workflow` posterior a `0006_business`. Añade a `service_requests`: `organization_id`, `tour_id`, `scheduled_at`, `operations_notes`, `delivered_at`, `delivered_version_id`, `work_revision` y `origin`. Añade checks, índice, unicidad de tour por trabajo y FK compuesta que impide vincular tours de otra organización. `tours` incorpora una restricción única `(id, organization_id)` para esa FK.

`delivered_version_id` conserva la referencia histórica incluso si la publicación se retira y se limpia después; no mantiene artificialmente activos sus archivos. `work_revision` y el estado esperado evitan sobrescrituras y entregas duplicadas. Las reservas de cuota y creación se serializan bloqueando la organización.

Se aplicó sólo esquema al PostgreSQL local. Se compararon conteos antes y después: usuarios, organizaciones, clientes, propiedades, recorridos, escenas, hotspots, solicitudes y publicaciones sin cambios. No se ejecutó backfill, transferencia de tours personales, cambio de infraestructura ni limpieza de datos del usuario.

Rutas relativas a `/api/v1`:

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/admin/service-requests/{id}/work` | Preparar una solicitud web; administrador y miembro con escritura |
| GET / POST | `/organizations/{org}/jobs` | Lista paginada y filtrada por estado / creación manual |
| GET / PUT | `/organizations/{org}/jobs/{id}` | Detalle / fecha y notas con revisión esperada |
| PUT | `/organizations/{org}/jobs/{id}/status` | Transición autorizada con estado esperado |
| GET | `/organizations/{org}/jobs/{id}/events` | Historial privado |
| POST | `/organizations/{org}/jobs/{id}/delivery` | Registrar entrega manual y finalizar |

Archivos nuevos: `backend/app/modules/studio/work_service.py`, `backend/migrations/versions/0007_studio_workflow.py`, `backend/tests/test_workflow.py`, `frontend/src/features/business/{JobsPanel,WorkForm,WorkDetail}.tsx`, `frontend/src/features/business/workflow.ts`, `frontend/tests/jobs.spec.ts` y este documento.

Integraciones: modelos/schemas/router/service de Studio, modelos/service de tours, service de propiedades, `Workspace`, `OrganizationsPanel`, `ToursPanel`, `StudioPanel`, API y tipos generados; pruebas de navegador y README. Sin dependencias nuevas ni variables obligatorias nuevas.

## Verificación

Actualización de selección libre de estados: 13 pruebas de backend correctas, más el runner de navegador con cuatro casos correctos (solicitudes y trabajos en escritorio/móvil). Verifican ocho opciones visibles, saltos de estado, reapertura y requisitos de publicación/entrega. TypeScript y build correctos. Sin migraciones ni cambios de datos existentes para este ajuste.

Resultado final: **75 tests pytest correctos** en 151,14 s, incluido el runner que ejecutó **35 casos Playwright correctos y 1 omitido intencionalmente** (gesto táctil CDP en desktop). Sin fallos finales. Durante la revisión se corrigieron dos selectores/datos de tests: la referencia de reintento al probar aislamiento y la consulta accesible de un textarea con contenido; luego se volvió a ejecutar toda la suite.

Tipos OpenAPI regenerados, TypeScript y build Vite correctos. `pip check` sin incompatibilidades, `SELECT 1` correcto, Alembic en `0007_workflow` y `alembic check` sin diferencias. Backend y panel HTTP 200; OpenAPI del proceso real incluye las rutas nuevas. Configuración local de la cuenta administradora verificada. Revisión visual de la ficha entregada en escritorio y móvil. Se mantienen API, frontend y worker locales activos. Starlette emite el aviso de deprecación ya existente de TestClient/httpx.

Los tests usan bases y archivos temporales separados. Cubren creación atómica y reintentos, reutilización, rechazo de enlaces entre organizaciones, revocación y viewer, privacidad de trabajos manuales, cuota concurrente con rollback, conversión web, fechas con zona, revisión concurrente, publicación y entrega. El navegador prueba escritorio y móvil emulado, incluyendo editor, worker, publicación, entrega, recarga y visita anónima del enlace.

Comandos desde `backend/`, con PostgreSQL local activo:

```sh
.venv/bin/alembic upgrade head
.venv/bin/alembic check
.venv/bin/python -m app.db.check
RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome .venv/bin/python -m pytest -q
```

Desde `frontend/`: `npm run generate:api` y `npm run build`. No hay lint configurado. Safari/WebKit y dispositivos físicos siguen pendientes en este entorno.

## Alcance pendiente

Los enlaces locales sólo permiten simular la entrega en esta computadora. El servicio de Internet requiere despliegue, dominio, storage/CDN y respaldos. No se habilitaron cobros, envío de WhatsApp/email, sincronización de calendarios, archivo de trabajos ni marketplace. No se importaron recorridos personales ni se crearon trabajos de prueba en la base real.

## Clientes y navegación

La navegación actual está descrita en [UX.md](UX.md): Trabajos, Organizaciones, Particulares y Clientes en el sidebar. Configuración está retirada temporalmente. En móvil se despliega con Menú. El acceso a Solicitudes Studio también queda retirado; los trabajos manuales y existentes continúan disponibles. La organización activa se conserva al cambiar de sección; se mantienen las acciones contextuales de volver y abrir registros.

Clientes permite eliminar con confirmación a propietarios, administradores y editores. `DELETE /api/v1/organizations/{organization_id}/clients/{client_id}` exige sesión, CSRF y permisos de escritura de esa organización y responde 204. Con `0009_deletions`, responde 204 incluso si hay vínculos: lo retira de la agenda y conserva su referencia histórica, propiedades, recorridos y trabajos. No hay borrado en cascada. Ver [eliminación sin perder trabajos](UX.md#eliminar-sin-perder-trabajos).

Validación de esta entrega: TypeScript/build correctos; 14 pruebas de backend de negocio y trabajos aprobadas. Los 8 casos específicos de navegador (clientes/navegación, cartera/permisos, solicitudes y entrega, en Chrome escritorio y móvil emulado) pasaron mediante el runner con PostgreSQL y almacenamiento temporales (61,35 s). Se corrigió la sincronización del helper de navegación con el login y la apertura del menú móvil. La suite general no quedó aprobada: mostró fallos de coordenadas y sincronización de transiciones en pruebas del visor y superó el límite de 240 s; no se modificó el visor como parte de esta entrega. No se eliminaron clientes reales.

La revisión `0008_individuals` admite particulares como espacios separados, sin trasladar los trabajos o recorridos anteriores. Ver el comportamiento de directorios, permisos y creación de trabajos en [UX.md](UX.md).

Eliminar organizaciones o particulares también conserva los trabajos. Los propietarios pueden hacerlo desde la ficha o el directorio, con confirmación. Los trabajos del espacio eliminado siguen en Trabajos, con «eliminada» en su selector. No se admiten trabajos nuevos en ese espacio; el editor, la entrega y el enlace publicado de los existentes se conservan. La migración 0009 se aplicó sin modificar los registros del usuario.

Verificación de esta actualización: build aprobado, 80 pruebas de backend y 14 casos del panel en escritorio/móvil aprobados. Los datos reales se conservaron.

Clientes es ahora una lista unificada de las fichas creadas desde Organizaciones y Particulares. No tiene alta independiente. Desde la cartera se abren sus recorridos o trabajos y se puede eliminar la misma ficha, conservando el historial. Los contactos del pedido se completan desde Nuevo trabajo. Ver [la explicación de identidad y datos históricos](UX.md#clientes-una-sola-identidad-por-contratante).


### Contacto desde la ficha del cliente

Nuevo trabajo solicita únicamente título, tipo de espacio, localidad, superficie, ambientes y detalle del pedido. Nombre, email y teléfono provienen de la ficha del particular u organización; en empresas se usa el responsable si está informado. La localidad se precarga y sigue siendo editable para cada inmueble. Para corregir el contacto se edita la ficha del cliente, sin volver a cargarlo por trabajo. Email y teléfono opcionales no bloquean la creación.

La API manual acepta `use_customer_profile: true` y obtiene el contacto desde la organización autorizada en el servidor, sin confiar en datos de contacto enviados por el navegador. Cada trabajo conserva una copia histórica del contacto al crearse; los siguientes usan la ficha actualizada. Los contactos internos con los mismos datos se reutilizan dentro de ese cliente, sin duplicarlos por trabajo. Los formularios públicos mantienen sus datos y validaciones originales, y convertir una solicitud conserva el contacto que la envió. Los enlaces existentes de cliente/propiedad/recorrido continúan disponibles en la API por compatibilidad, aunque no se ofrecen en este formulario.

La migración `0019_work_contact_profile` amplía los teléfonos de trabajos y contactos internos a 50 caracteres para conservar el formato ya permitido en la ficha, sin recortes. Aplicar con `alembic upgrade head` antes de iniciar el backend actualizado (el arranque de Docker ya ejecuta las migraciones).
