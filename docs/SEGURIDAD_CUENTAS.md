# Seguridad de registro y acceso

Esta etapa añade verificación de email, recuperación/cambio de contraseña y límites persistentes. No incluye doble factor ni gestión de dispositivos.

## Estado del demo sin dominio remitente

`AUTH_REQUIRE_VERIFIED_EMAIL=false` es el valor predeterminado. Los nuevos registros siguen entrando al estudio, sin afirmar que su email está verificado. Se puede pedir la verificación desde **Mi cuenta → Email y contraseña**. El modo obligatorio está implementado y probado, pero no se exige mientras el envío a usuarios esté limitado por el remitente de prueba de Resend. Las cuentas anteriores no se bloquean ni se marcan verificadas al migrar.

El envío utiliza las variables existentes `RESEND_API_KEY`, `SERVICE_NOTIFICATION_FROM`, `SERVICE_NOTIFICATION_TO` y `PUBLIC_APP_URL`. Con `onboarding@resend.dev` sólo está autorizado el email de la cuenta de Resend, configurado como `SERVICE_NOTIFICATION_TO`; los demás destinatarios quedan pendientes y sus enlaces terminan venciendo. Nunca se redirigen enlaces de cuenta de un usuario al operador. La interfaz advierte de esta limitación y enlaza al contacto del inicio.

Para habilitar la exigencia en nuevos registros: verificar un dominio remitente en Resend, configurar `SERVICE_NOTIFICATION_FROM` con ese dominio, comprobar entrega y `PUBLIC_APP_URL` HTTPS correcto y después establecer `AUTH_REQUIRE_VERIFIED_EMAIL=true`. No activar primero la exigencia. Afecta a nuevas cuentas; las anteriores mantienen acceso hasta completar voluntariamente su verificación. Activarlo no comprueba por sí solo la titularidad de las cuentas históricas.

## Funcionamiento

- **Registro con exigencia activa:** crea una sesión limitada. Las APIs del estudio rechazan el acceso hasta verificar. Se puede consultar la sesión, reenviar verificación y cerrar sesión.
- **Verificar email:** enlace `/cuenta/verificar#token=…`, válido por 24 horas. Requiere pulsar un botón; abrirlo no consume el código. No inicia sesión automáticamente.
- **Olvidé mi contraseña:** respuesta genérica para cuentas existentes o inexistentes. El enlace `/cuenta/restablecer#token=…` vence en 30 minutos. Pedirlo no bloquea ni cierra la cuenta.
- **Restablecer:** cambia la contraseña y revoca todas las sesiones y enlaces de recuperación anteriores. Requiere volver a ingresar.
- **Cambiar contraseña:** en **Mi cuenta → Email y contraseña**, exige la contraseña actual y repetir la nueva (12–128 caracteres). Revoca otras sesiones y enlaces de recuperación; renueva la sesión actual y su CSRF.

Los tokens tienen un identificador aleatorio y un secreto HMAC separado de los hashes guardados en PostgreSQL. Se reconstruyen sólo en el servidor para enviar el correo. No se guardan enlaces ni tokens en la cola, logs ni respuestas públicas. El fragmento del enlace no llega al servidor web y se elimina de la barra al abrir la página. Consumo y cambio de contraseña se serializan en PostgreSQL para impedir reutilizaciones simultáneas. Los emails reutilizan el transporte HTTPS de Resend y sus claves de idempotencia. Se cancelan tareas de enlaces usados o vencidos. Cambiar `CSRF_SECRET` invalida enlaces anteriores; los usuarios deberán solicitar otros.

## Límites

Contadores atómicos en PostgreSQL, compartidos entre procesos y reinicios:

- Registro, login y consumo de enlaces: 30 solicitudes por IP cada 10 minutos.
- Login: además, 10 intentos por email cada 10 minutos, exista o no la cuenta.
- Solicitudes de email: 10 por IP cada 10 minutos y 3 por email y propósito por hora.
- Cambio de contraseña: 10 por IP y por cuenta cada 10 minutos.

Son ventanas fijas que cuentan solicitudes, no sólo fallos. Las identidades se guardan con HMAC; no se almacenan IPs ni emails en claro en los contadores. Los contadores antiguos se limpian después de un día. El despliegue debe aceptar las cabeceras de IP únicamente desde su proxy de confianza; el contenedor de demo se ejecuta detrás de Render. Esto no sustituye una protección perimetral frente a ataques de gran volumen.

## Migración y verificación

`cd backend && .venv/bin/alembic upgrade head` aplica `0015_account_security`. Render la aplica al iniciar. No cambia contraseñas, propiedad de los estudios, datos de clientes, fotos ni publicaciones.

Las pruebas cubren CSRF, vencimiento, uso único, carrera de consumo, invalidación de sesiones, límites entre aplicaciones independientes, correos simulados y compatibilidad del modo de prueba. El navegador ejecuta el flujo con exigencia activa usando únicamente una base temporal `_test`; no existe un endpoint de prueba para obtener tokens. No se enviaron emails reales durante las pruebas.

Quedan para otra etapa: doble factor, dispositivos/sesiones visibles, cierre por inactividad, protección de contraseñas comprometidas y respuesta de registro que no revele si el email ya existe. El registro continúa devolviendo el error de email duplicado de la versión anterior.
