# Mi cuenta

Se abre haciendo clic en la foto o en **Mi cuenta** de la barra superior. Reúne el perfil y el acceso; reemplaza el botón anterior de Seguridad de cuenta.

**Datos de mi cuenta:** foto (subir, reemplazar o quitar), nombre y apellido, Particular o Empresa, teléfono y nombre de empresa opcional. Muestra el email de acceso y la fecha de registro. El tipo de cuenta describe a quien usa Vision360: no modifica estudios, clientes, membresías ni permisos. Los cambios de texto se guardan con el botón; la foto se guarda al subirla. Cerrar con datos sin guardar pide descartar los cambios.

**Email y contraseña:** estado de verificación, solicitud de verificación, cambio confirmado de email y cambio de contraseña. También se puede cerrar sesión desde el panel.

## Cambio de email

Exige la contraseña actual y un enlace al nuevo email. Hasta confirmar se mantiene el email anterior, los datos y el acceso. Se puede cancelar el cambio pendiente. Al confirmar, el nuevo email queda verificado y se cierran todas las sesiones. Se invalidan los enlaces de recuperación y verificación anteriores. La unicidad del email se comprueba nuevamente al confirmar; si otro usuario lo registró en el intervalo, el cambio se rechaza y se conserva el email anterior.

Sigue vigente la limitación del remitente de prueba de Resend: sin un remitente autorizado para todos, no se pueden completar cambios hacia emails que el proveedor no admite. No se reemplaza el email sin probar acceso a la nueva casilla. El enlace vence a los 30 minutos, es de un solo uso y no se consume al abrirlo. No se enviaron correos reales en las pruebas.

## Foto privada

Acepta JPEG, PNG o WebP estáticos de hasta 5 MiB y 16 megapíxeles (máximo 8192 px por lado). Se recorta al centro y se convierte a JPEG cuadrado de 256 × 256, eliminando EXIF. El original no se conserva. Las transparencias se convierten con fondo blanco.

Se guarda en el almacenamiento privado ya configurado (local en desarrollo, S3/Supabase en producción). PostgreSQL sólo guarda la referencia, no la imagen. La API requiere sesión y sólo permite leer la foto de esa cuenta. Para S3 genera acceso firmado de corta duración; la foto no se publica en los recorridos. Los reemplazos y las eliminaciones programan la limpieza del archivo anterior. Una intención de limpieza persistida antes de subir también cubre cargas interrumpidas. El procesamiento está serializado por instancia para limitar el consumo de memoria.

## Migración

`0016_account_profile` añade los campos privados y el destino de las confirmaciones de email. Las cuentas anteriores conservan su acceso y pueden completar sus datos. El tipo inicial es Particular, editable; no se intenta inferirlo a partir de sus clientes o estudios. Render ejecuta la migración al iniciar. En desarrollo: `cd backend && .venv/bin/alembic upgrade head` y reiniciar API/worker si no tienen recarga automática.

## Mi plan

La pestaña **Mi plan** muestra la suscripción del estudio propio, vencimiento y uso estimado, con acceso a consultar una ampliación. Las activaciones se coordinan manualmente con administración; ver [Suscripciones](SUSCRIPCIONES.md).


Las secciones tienen rutas propias: `/studio/mi-cuenta/perfil`, `/studio/mi-cuenta/seguridad` y `/studio/mi-cuenta/plan`, con el estudio activo en la query. El diálogo conserva la pestaña al recargar y responde a Atrás/Adelante. Los enlaces permiten abrir cada sección en otra pestaña. Los cambios de perfil sin guardar requieren confirmación antes de salir o cambiar de pestaña. Ver [rutas y navegación](UX.md#fichas-mi-cuenta-y-organización-de-rutas).
