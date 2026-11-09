# Base de suscripciones de Vision360

Esta etapa prepara la venta del uso del sistema a fotógrafos. No incluye el servicio de ir a fotografiar una propiedad, precios, pasarela de pagos, facturas ni débitos automáticos.

## Qué se puede usar

- **Mi cuenta → Mi plan**: el titular ve el plan de su estudio propio, estado, vencimiento, publicados, publicaciones en preparación y reserva estimada de almacenamiento. Los colaboradores de un cliente no pueden ver el plan del estudio ajeno.
- **Administración → Usuarios registrados → Gestionar plan**: el administrador de plataforma puede asignar, renovar y programar una cancelación. Toda operación requiere una nota y queda en un historial de los últimos 50 cambios de ese estudio, con actor, fechas y valores anteriores/nuevos. No implica pago recibido.
- Una revisión numérica evita sobrescribir cambios de otro administrador. Repetir un envío con la misma revisión devuelve 409 sin sumar días dos veces.

Catálogo inicial provisional (sin precios):

| Plan | Duración inicial | Publicados simultáneamente | Ambientes por recorrido | Reserva estimada |
| --- | --- | --- | --- | --- |
| Prueba | 14 días | 1 | 6 | 1 GiB |
| Profesional | Período manual (30 días por defecto) | 10 | Límite técnico existente | 2 GiB |
| Estudio | Período manual (30 días por defecto) | 30 | Límite técnico existente | 10 GiB |

Las cuotas de almacenamiento se configuran en `SUBSCRIPTION_TRIAL_STORAGE_BYTES`, `SUBSCRIPTION_PROFESSIONAL_STORAGE_BYTES` y `SUBSCRIPTION_STUDIO_STORAGE_BYTES`. No representan espacio contratado en Supabase: antes de vender, hay que contrastarlas con capacidad y consumo reales. Los límites técnicos anteriores por archivo, recorrido y organización siguen aplicándose.

Las nuevas cuentas reciben la prueba al crearse su estudio, incluso si después cambian de email. El reloj comienza en esa fecha; no se reinicia al iniciar sesión. La migración asigna **Acceso anterior** (`legacy`) sin vencimiento comercial a todos los estudios que ya existían, preservando trabajos, fotos, enlaces y sus límites técnicos actuales. Un administrador puede pasar esas cuentas a un plan nuevo cuando se acuerde comercialmente; no hay una conversión automática a pago. También puede restaurar Acceso anterior deliberadamente.

## Períodos, renovación y cancelación

Asignar el mismo plan con período aún vigente suma días al vencimiento actual; un plan distinto o vencido comienza un período nuevo desde el momento de asignación. La prueba siempre suma 14 días. Profesional y Estudio admiten 1–366 días por operación (no se presupone que todos los meses tienen 30 días). Acceso anterior no vence.

Cancelar programa el fin al vencimiento ya existente; no corta el período vigente. Renovar/reactivar es una acción manual explícita. No se registran estados de pago ni se presupone dinero cobrado.

El vencimiento se calcula al consultar o intentar una operación: no depende de un cron. **No se eliminan datos ni se despublican enlaces automáticamente** al vencer o cancelar. El archivo definitivo, el período de gracia, la exportación y la despublicación por impago quedan pendientes de una política acordada y de la etapa de cobros; no se deben prometer como funciones implementadas.

## Activación de límites comerciales

**Predeterminado: `SUBSCRIPTION_LIMITS_ENABLED=false`.** Los planes y fechas se guardan y muestran, pero sus límites comerciales no bloquean acciones en la etapa de prueba. La interfaz lo indica. Los límites técnicos previos continúan activos. No activar el flag sin revisar las cuotas y avisar a los usuarios afectados.

Al activar `SUBSCRIPTION_LIMITS_ENABLED=true`:

- Se controla el total del estudio, agrupando todos sus clientes (incluso archivados) y sus recorridos personales antiguos. El plan del editor invitado no presta cuota al estudio dueño.
- Publicaciones en preparación de recorridos todavía no publicados reservan lugares. Un candado transaccional de PostgreSQL por estudio serializa las reservas entre clientes distintos para no exceder el cupo en solicitudes concurrentes.
- Republicar un recorrido publicado conserva su lugar; despublicarlo libera cupo. Una reducción de plan por debajo del uso no borra ni despublica lo existente, pero impide sumar publicaciones hasta ajustar el uso o ampliar el plan.
- La prueba limita el alta de ambientes y rechaza publicar recorridos con más de seis ambientes que hubieran sido preparados antes de activar los límites.
- Al vencerse un plan se rechazan nuevas reservas de carga, nuevos ambientes y publicaciones con cambios. Se conserva la consulta y edición de datos existentes, el ingreso a la cuenta y los enlaces publicados. Las operaciones aceptadas antes de vencer pueden terminar de procesarse.
- El almacenamiento se reserva al preparar una carga: tamaño declarado del original más 40 MiB por original para derivados privados y copias públicas. Se cuentan originales no rechazados de borradores, pendientes y versiones retenidas. La reserva se libera cuando la lógica existente elimina/rechaza los originales. Reemplazar una foto puede requerir margen temporal para ambas versiones.

Esta reserva es conservadora, **no es medición exacta del proveedor**: no incluye egreso, avatares, colas, archivos temporales o borrados demorados. No hay control de ancho de banda por suscripción en esta etapa; monitorear Supabase sigue siendo necesario.

## API y permisos

- `GET /workspaces/{workspace_id}/subscription`: sólo titular del estudio.
- `GET /admin/accounts/{user_id}/subscription`: sólo administrador de plataforma.
- `PUT /admin/accounts/{user_id}/subscription`: asignación/renovación; CSRF, `plan_code`, `duration_days`, `revision`, `note`.
- `POST /admin/accounts/{user_id}/subscription/cancel`: CSRF, `revision`, `note`.
- `GET /admin/accounts/{user_id}/subscription/events`: historial privado de administración.

Se reutilizan sesión, CSRF y `PLATFORM_ADMIN_USER_IDS`. El registro y el perfil no aceptan un plan elegido por el usuario. No se agregaron dependencias, credenciales ni permisos automáticos por email.

Migración: `0017_subscriptions` crea `subscriptions` y `subscription_events`, conserva las cuentas anteriores y participa en `alembic upgrade head`. Su downgrade elimina esos datos de suscripción: es una reversión de esquema, no una cancelación comercial.

## Verificaciones

Pruebas con PostgreSQL temporal: privacidad y roles, prueba inicial, conservación de cuentas anteriores, asignación/renovación/cancelación con auditoría, revisiones concurrentes, vencimientos, reservas de almacenamiento entre clientes, editor invitado, cupos de publicación concurrentes y republicación. Playwright comprueba consulta del titular y gestión administrativa completa en escritorio y celular sin proveedores externos ni correos reales.

## Planes en el inicio y elección antes del registro

`/inicio#planes` muestra Prueba, Profesional y Estudio desde `GET /api/v1/public/plans`, que reutiliza el catálogo del backend y omite Acceso anterior. Se muestran las cuotas iniciales, los 14 días gratis de prueba y «Precio a consultar» para los otros planes. No se publica un precio no acordado ni se activa una pasarela de pagos.

Cada botón lleva a `/studio?registro=1&plan=trial|professional|studio`. Sin sesión se abre **Crear cuenta** con la elección visible y la opción de ingresar si ya se tiene una cuenta. Con una sesión iniciada se omite el formulario de registro. Luego del registro o ingreso se abre **Mi cuenta → Mi plan**, conservando la elección en la URL incluso si se recarga o está pendiente verificar el email. Al cerrar Mi cuenta se limpia ese parámetro.

Elegir un plan es una intención de navegación, no una asignación comercial: la cuenta nueva continúa recibiendo su prueba habitual y una cuenta existente conserva su suscripción. El plan elegido se muestra junto al plan real; los planes pagos requieren la activación manual del administrador. La prueba gratuita está activa automáticamente para cuentas nuevas y se puede activar directamente desde Mi plan en cuentas anteriores elegibles. «Consultar activación» abre el formulario de contacto con el nombre del plan en la consulta, editable antes de enviarla. No se envían consultas, emails ni cargos al hacer clic en una tarjeta.

Sólo se aceptan los códigos públicos del catálogo como selección. No se interpreta `legacy`, un precio, una URL externa o un código arbitrario como un plan elegible. La elección no cambia permisos, no reinicia la prueba y no habilita planes pagos por modificar la URL. No se requieren migraciones nuevas para esta navegación.


## Activación de la prueba gratuita

La prueba gratuita de **14 días** no requiere precio, tarjeta, contacto ni aprobación administrativa. El inicio muestra «Gratis · 14 días» y «Activación inmediata · Sin tarjeta». Tras registrarse, el plan de prueba ya está activo y se ofrece «Empezar a usar mi estudio».

Una cuenta anterior con Acceso anterior que nunca haya tenido una prueba u otro plan puede activarla con **Activar prueba gratuita** desde la elección del inicio en Mi plan. `POST /workspaces/{workspace_id}/subscription/trial` exige sesión del titular, verificación de email cuando corresponda y CSRF. Guarda período e historial de activación en una sola transacción, reutilizando el candado del estudio. No se agrega ninguna migración.

La operación es idempotente: si ya existe una prueba, devuelve su estado y fecha original, incluso si venció. No la reinicia ni la renueva. No reemplaza planes pagos y volver a Acceso anterior no borra el historial que impide repetir la prueba. Los cambios administrativos deliberados siguen disponibles sólo para administración.

Esta modificación no convierte la prueba en un plan gratuito permanente ni cambia el flag de límites comerciales; se mantiene el período previamente definido de 14 días. Los planes pagos siguen siendo de activación manual.


La cuota gratuita se ajustó a **un recorrido publicado, hasta seis panorámicas (una por ambiente) y 1 GiB de reserva**, manteniendo los 14 días. Con el límite técnico actual de 50 MiB por original y el margen de 40 MiB por original, seis fotos requieren como máximo 540 MiB de reserva; el GiB deja margen para reemplazos. Los borradores y versiones retenidas también consumen esa cuota. No se reducen las dimensiones ni la calidad de imagen por pertenecer al plan gratuito.

Si Render ya tiene `SUBSCRIPTION_TRIAL_STORAGE_BYTES` definido, actualizarlo a `1073741824` porque las variables de entorno prevalecen sobre el valor predeterminado del código. Este cambio no activa `SUBSCRIPTION_LIMITS_ENABLED`.
