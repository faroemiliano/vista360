# Contacto con el dueño de Vision360

La sección Contacto de `/inicio` explica qué hace el sistema y permite consultar a Emiliano sin registrarse. Incluye email, teléfono y consulta, sin pedir datos de una propiedad. No aparece en el ingreso ni el registro.

El formulario envía a `POST /api/v1/platform-contact`, con CSRF, límite de solicitudes y campo antispam. Valida email y formato del teléfono en el servidor: diez dígitos nacionales con código de área, o formato internacional con + y 8 a 15 dígitos. Esto no comprueba que la persona sea dueña del email o teléfono; no hay códigos OTP ni mensajes de verificación.

Las consultas se guardan como tareas durables `notify_service`, con contenido `platform_contact`, referencia y destinatario fijo `farixio.tech@gmail.com`. No generan solicitudes de fotografía, clientes ni trabajos. La referencia sirve para idempotencia: reintentar la misma consulta no duplica avisos. El worker usa la configuración existente de Resend y sus reintentos. Si el correo no está configurado, la tarea queda pendiente. El mensaje incluye email, teléfono y consulta; permite responder al email del visitante. No se envía un correo automático al visitante.

El WhatsApp flotante solo está en el inicio y apunta a `https://wa.me/5491170612602`, con un mensaje inicial sobre Vision360. Abre WhatsApp al pulsarlo; el visitante decide si envía el mensaje. No interfiere con los formularios propios de los fotógrafos ni con los recorridos públicos.

No hay nuevas dependencias, variables ni migraciones. Verificar en Render la configuración existente `RESEND_API_KEY`, `SERVICE_NOTIFICATION_FROM` y `SERVICE_NOTIFICATION_TO=farixio.tech@gmail.com` para que el worker pueda enviar el aviso. La confirmación web indica que se guardó la consulta, no acredita entrega en la casilla de correo.
