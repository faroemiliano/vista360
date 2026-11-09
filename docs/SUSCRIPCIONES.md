# Base de suscripciones de Vision360

Esta etapa prepara la venta del uso del sistema a fotógrafos. No incluye el servicio de ir a fotografiar una propiedad, precios, pasarela de pagos, facturas ni débitos automáticos.

## Qué se puede usar

- **Mi cuenta → Mi plan**: el titular ve el plan de su estudio propio, estado, vencimiento, publicados, publicaciones en preparación y reserva estimada de almacenamiento. Los colaboradores de un cliente no pueden ver el plan del estudio ajeno.
- **Administración → Usuarios registrados → Gestionar plan**: el administrador de plataforma puede asignar, renovar y programar una cancelación. Toda operación requiere una nota y queda en un historial de los últimos 50 cambios de ese estudio, con actor, fechas y valores anteriores/nuevos. No implica pago recibido.
- Una revisión numérica evita sobrescribir cambios de otro administrador. Repetir un envío con la misma revisión devuelve 409 sin sumar días dos veces.

Catálogo inicial provisional (sin precios):

| Plan | Duración inicial | Publicados simultáneamente | Ambientes por recorrido | Reserva estimada |
| --- | --- | --- | --- | --- |
| Prueba | 14 días | 1 | 10 | 256 MiB |
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
- La prueba limita el alta de ambientes y rechaza publicar recorridos con más de diez ambientes que hubieran sido preparados antes de activar los límites.
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
