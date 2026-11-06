# Consultas web y avisos por email

El formulario público guarda la consulta y un trabajo de notificación en la misma
transacción PostgreSQL. El worker existente envía el aviso al operador mediante
la API HTTPS de Resend. No se envían correos al visitante automáticamente.

## Bandeja de administración

La cuenta configurada en `PLATFORM_ADMIN_USER_IDS` ve **Solicitudes web** en el
sidebar. La ruta es `/studio/solicitudes`; cada correo enlaza a
`/studio/solicitudes?solicitud=UUID`. El enlace exige iniciar sesión con una cuenta
administradora; no contiene credenciales ni concede permisos.

La bandeja permite consultar datos y mensaje, cambiar estado, registrar notas y
preparar un trabajo para un cliente del estudio seleccionado. Al guardar abre el
trabajo en `/studio/trabajos/UUID`. Una cuenta normal no ve la entrada del menú y
la API rechaza tanto listar como consultar por ID.

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
consultas existentes. El supervisor de Render ejecuta `alembic upgrade head` al
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
