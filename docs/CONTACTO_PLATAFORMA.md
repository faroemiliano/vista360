# Contacto con el dueño de Vision360

La sección Contacto de `/inicio` explica qué hace el sistema y permite consultar a Emiliano sin registrarse. Incluye email, teléfono y consulta, sin pedir datos de una propiedad. No aparece en el ingreso ni el registro.

El formulario envía a `POST /api/v1/platform-contact`, con CSRF, límite de solicitudes y campo antispam. Valida email y formato del teléfono en el servidor: diez dígitos nacionales con código de área, o formato internacional con + y 8 a 15 dígitos. Esto no comprueba que la persona sea dueña del email o teléfono; no hay códigos OTP ni mensajes de verificación.

Las consultas se guardan como tareas durables `notify_service`, con contenido `platform_contact`, referencia y destinatario fijo `farixio.tech@gmail.com`. No generan solicitudes de fotografía, clientes ni trabajos. La referencia sirve para idempotencia: reintentar la misma consulta no duplica avisos. El worker usa la configuración existente de Resend y sus reintentos. Si el correo no está configurado, la tarea queda pendiente. El mensaje incluye email, teléfono y consulta; permite responder al email del visitante. No se envía un correo automático al visitante.

## Bandeja de administración

El administrador de la plataforma puede entrar a **Administración → Consultas del sistema** en el sidebar (`/studio/consultas`). La bandeja incluye las consultas anteriores y nuevas, ordenadas desde la más reciente, independientemente del resultado del aviso por email. Cada consulta se despliega para mostrar email, teléfono, mensaje completo, fecha y referencia. **Llamar** abre el marcador del dispositivo y **Responder por email** abre su aplicación de correo; ninguna acción envía mensajes automáticamente.

La búsqueda literal permite filtrar por email, teléfono o mensaje; la paginación muestra 50 consultas por página y **Actualizar** vuelve a consultar la bandeja. Búsqueda y página se conservan en la URL y funcionan con Atrás/Adelante. La interfaz está disponible en español y portugués; el contenido enviado por el visitante conserva su idioma original.

`GET /api/v1/admin/platform-contacts` requiere una sesión verificada según la configuración de acceso y un ID autorizado en `PLATFORM_ADMIN_USER_IDS`. Un titular de estudio común no tiene acceso, ni siquiera por URL o API directa. Devuelve sólo los datos del formulario y su referencia/fecha, con `Cache-Control: no-store`; no expone payloads, tokens ni detalles del procesamiento. No se agregan migraciones ni se mueven registros: las consultas existentes permanecen en su almacenamiento actual.

El WhatsApp flotante solo está en el inicio y apunta a `https://wa.me/5491170612602`, con un mensaje inicial sobre Vision360. Abre WhatsApp al pulsarlo; el visitante decide si envía el mensaje. No interfiere con los formularios propios de los fotógrafos ni con los recorridos públicos.

No hay nuevas dependencias, variables ni migraciones. Verificar en Render la configuración existente `RESEND_API_KEY`, `SERVICE_NOTIFICATION_FROM` y `SERVICE_NOTIFICATION_TO=farixio.tech@gmail.com` para que el worker pueda enviar el aviso. La confirmación web indica que se guardó la consulta, no acredita entrega en la casilla de correo.
