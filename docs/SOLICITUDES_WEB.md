# Consultas web y avisos por email

La página de inicio presenta la plataforma y el acceso al estudio; ya no incluye un formulario general de contratación. Las nuevas consultas se reciben desde el enlace o QR propio de cada estudio. Las consultas globales anteriores se conservan en la bandeja de administración.

El formulario público guarda la consulta y un trabajo de notificación en la misma
transacción PostgreSQL. El worker existente envía el aviso al operador mediante
la API HTTPS de Resend. No se envían correos al visitante automáticamente.

## Bandeja de administración

La cuenta configurada en `PLATFORM_ADMIN_USER_IDS` puede abrir **Consultas de
Vision360** desde **Solicitudes web**. Cada fotógrafo tiene además su bandeja propia
(ver la sección de formularios por estudio). La ruta global es `/studio/solicitudes?origen=vision360`; cada correo enlaza a
`/studio/solicitudes?solicitud=UUID&origen=vision360`. El enlace exige iniciar sesión con una cuenta
administradora; no contiene credenciales ni concede permisos.

La bandeja muestra cada solicitud plegada, con el nombre del solicitante y su estado. Al pulsar el nombre o la flecha se despliegan los datos de contacto, el inmueble, el mensaje y las acciones de gestión. Los enlaces a una solicitud concreta la abren desplegada.

La bandeja permite consultar datos y mensaje, cambiar estado, registrar notas y
preparar un trabajo para un cliente del estudio seleccionado. Al guardar abre el
trabajo en `/studio/trabajos/UUID`. Una cuenta normal accede a sus propias consultas. La API de administración de
Vision360 rechaza tanto listar como consultar por ID a cuentas sin ese permiso.

Para habilitar a la cuenta del operador en **el entorno desplegado**:

1. Iniciar sesión en Vision360 con esa cuenta.
2. Abrir `/api/v1/auth/session` en otra pestaña del mismo dominio y copiar sólo
   `user.id`. No copiar cookies, tokens CSRF ni el resto de la respuesta.
3. En las variables del Web Service Render, configurar
   `PLATFORM_ADMIN_USER_IDS=["UUID-DE-ESA-CUENTA"]`. Conservar cualquier otro UUID
   de administrador que ya estuviera autorizado. Guardar y redesplegar.

El email del destinatario no otorga permisos de administración. No se promueve a
ninguna cuenta por email ni se modifican cuentas de producción desde el código.

## Activar los avisos en Render

Configurar en el Web Service (API y worker heredan las mismas variables):

| Variable | Valor |
| --- | --- |
| `RESEND_API_KEY` | Clave privada de Resend con permiso de envío |
| `SERVICE_NOTIFICATION_TO` | `farixio.tech@gmail.com` (destinatario aprobado) |
| `SERVICE_NOTIFICATION_FROM` | Remitente autorizado por Resend |
| `PUBLIC_APP_URL` | `https://vista360.onrender.com` |

Registrar la cuenta de Resend con el mismo email del destinatario permite probar
con `SERVICE_NOTIFICATION_FROM=onboarding@resend.dev`. Ese dominio de prueba sólo
permite enviar al email de la cuenta de Resend. Para otro destinatario o uso
regular, verificar un dominio propio y usar un remitente de ese dominio.
Nunca usar Gmail como remitente sin un dominio autorizado. La clave va sólo en
Render o en `.env` privado; nunca en el frontend, GitHub ni el chat.

El correo incluye datos del contacto y del inmueble, mensaje, botón **Ver
solicitud**, referencia y `Reply-To` del visitante para poder responderle.

La migración `0012_service_notifications` amplía los tipos de la cola; no modifica
consultas existentes. El supervisor de Render ejecuta `alembic upgrade head` (incluida la migración 0013) al
arrancar. Desarrollo local: `cd backend && .venv/bin/alembic upgrade head`.
Las consultas nuevas generan avisos; no se envían avisos retroactivos por
consultas anteriores a esta versión.

## Fallos y reintentos

- Si falta configuración, el worker deja los avisos en cola sin consumir intentos.
  Al configurar y reiniciar procesará esos avisos pendientes.
- Hay hasta tres intentos automáticos por fallos de conexión, límite temporal o
  error del proveedor. Cada intento tiene un timeout de diez segundos.
- El payload se fija en el primer intento. Los reintentos conservan contenido,
  destinatario y clave de idempotencia, incluso si cambia la configuración.
- Resend conserva la clave 24 horas. Si pasaron 23 horas desde el primer intento,
  no se vuelve a enviar automáticamente para evitar duplicados fuera de esa ventana.
- Errores permanentes (clave o remitente inválidos, por ejemplo) quedan fallidos y
  visibles en la bandeja. La consulta permanece disponible para atenderla manualmente.
- “Aviso por email enviado” significa que Resend aceptó el mensaje, no certifica
  entrega en Gmail. Revisar Resend y spam si el mensaje no aparece.
- En Render gratuito el worker se suspende junto con el servicio: el aviso puede
  demorarse durante reinicios o suspensión, pero queda guardado en PostgreSQL.

## Verificación sin correos reales

`backend/tests/test_service_notifications.py` simula el transporte HTTPS y prueba
idempotencia, reintentos, recuperación de lease, contenido escapado y privacidad.
El navegador prueba el formulario público, enlaces directos, acceso denegado a
otras cuentas y conversión en trabajo con PostgreSQL temporal. No usa datos reales
ni llama al proveedor de email.

Después de activar Resend, enviar una consulta propia desde `/inicio`: comprobar
la confirmación, la fila en **Solicitudes web**, el estado del aviso y su recepción
en Gmail. Abrir el enlace del correo y verificar que muestre esa solicitud.

Fuentes: [Render Free](https://render.com/docs/free),
[Resend Send Email](https://resend.com/docs/api-reference/emails/send-email),
[idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys),
[restricción del dominio de prueba](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

## Formularios de cada fotógrafo

Cada titular de estudio tiene ahora su propia bandeja **Solicitudes web**, sin
necesitar permiso de administrador de Vision360. Sólo el titular puede ver las
consultas privadas: una invitación para editar un cliente o sus recorridos no da
acceso a esta bandeja.

1. Abrir **Solicitudes web** y revisar el nombre del estudio (se cambia con
   **Editar estudio** en el encabezado).
2. Pulsar **Activar mi formulario**. La activación es voluntaria; los estudios
   existentes empiezan con su formulario desactivado.
3. Copiar o abrir **Mi enlace de solicitudes**, con formato `/solicitar/TOKEN`.
4. El cliente ve el nombre del estudio y envía la consulta sin registrarse.
5. El titular la ve en su bandeja y puede registrar seguimiento, aunque todavía
   no tenga clientes cargados. Una consulta no queda asociada automáticamente a
   un cliente.
6. Al pulsar **Preparar trabajo**, elegir **Nuevo cliente** o **Cliente existente**.
   Para un cliente nuevo se elige Particular o Empresa / organización; nombre,
   email, teléfono y localidad ya vienen de la consulta. **Guardar cliente y
   continuar** lo registra en la agenda del mismo estudio y abre la preparación
   del trabajo sin salir de la página. El cliente queda guardado aunque después
   se cancele el trabajo. Para uno existente se lo elige de la lista, sin volver
   a registrarlo. Volver a la bandeja conserva la consulta.

**Desactivar enlace** invalida el enlace compartido y conserva las consultas y
trabajos. Volver a activarlo genera un enlace nuevo. La página pública expone
únicamente el nombre del estudio, nunca el email del titular, clientes,
solicitudes ni el contenido de su cuenta.

La migración `0013_studio_request_pages` agrega un token público opcional al
estudio y `workspace_id` a la solicitud. Las consultas históricas del anterior
formulario de `/inicio` conservan `workspace_id=NULL`: siguen siendo consultas
para Vision360. No se redistribuyen consultas existentes entre fotógrafos.
El administrador de plataforma puede abrir **Consultas de Vision360** desde su
bandeja; tampoco esa bandeja global lista las consultas privadas de otros estudios.

Las rutas `/workspaces/UUID/service-requests` autorizan por titular y filtran por
estudio en todas las operaciones: listado, detalle, estado, historial y conversión
en trabajo. La conversión rechaza clientes de otro estudio incluso si el fotógrafo
tiene permiso de editar ese cliente. La clave de idempotencia de un formulario no
puede reutilizarse para redirigir la consulta a otro estudio.

### Avisos por email para cada estudio

El destinatario se toma del email registrado del titular, nunca de un campo del
formulario público. Se guarda al recibir la consulta y los reintentos mantienen
ese destinatario. El enlace del correo incluye `estudio=UUID` para abrir su bandeja
correcta después de iniciar sesión.

Con `SERVICE_NOTIFICATION_FROM=onboarding@resend.dev`, el worker sólo intenta
avisar a la dirección de prueba configurada en `SERVICE_NOTIFICATION_TO` (debe
coincidir con la cuenta de Resend). Los avisos a otros titulares quedan pendientes,
sin consumir intentos ni desviarlos al operador. La consulta permanece visible en
la app y muestra **Aviso por email pendiente de activación**.

Para enviar a todos los fotógrafos hay que verificar un dominio propio en Resend
y cambiar `SERVICE_NOTIFICATION_FROM` a un remitente de ese dominio. Se reutilizan
la clave, el worker y las demás variables existentes. No se necesita un proveedor
ni una suscripción de email por fotógrafo. La cuota del proveedor se comparte.

La suite `test_studio_request_pages.py` verifica aislamiento, activación y
revocación, idempotencia por destino y protección de avisos de prueba. El navegador
`studio-requests.spec.ts` simula dos fotógrafos y un visitante anónimo, prueba que
la consulta llega a uno solo y que puede convertirse en trabajo.

## QR de cada estudio

En **Solicitudes web**, al activar el formulario se muestra un código QR propio del estudio junto con su enlace. **Descargar QR** guarda una imagen PNG para imprimir o compartir. Escanearlo abre el formulario público del estudio sin que el visitante necesite registrarse. Las consultas llegan a ese estudio, no a otros fotógrafos.

El QR se genera en el navegador, sin enviar información a servicios externos. Conserva el mismo destino mientras el formulario esté activo. Desactivar el enlace también invalida las copias del QR ya compartidas; al reactivarlo se genera otro enlace y hay que descargar el nuevo QR.
