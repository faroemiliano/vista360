# Usuarios registrados de Vision360

El dueño del sistema puede consultar **Administración → Usuarios registrados** en el sidebar (`/studio/usuarios`). La sección es independiente de **Clientes**, que sigue mostrando las organizaciones y particulares del estudio seleccionado.

El directorio muestra todas las cuentas, incluida la del administrador: nombre, email actual, teléfono, particular/empresa, nombre de empresa, estudio propio, fecha de registro, confirmación del email y distintivo de administrador. Los datos del perfil son declarados por cada persona en **Mi cuenta**; confirmar el email no verifica identidad ni razón social. Las cuentas anteriores sin perfil figuran como particulares y «Sin nombre cargado» hasta que lo completen.

Se muestran totales globales de cuentas, particulares, empresas y emails verificados; no son cifras de clientes que pagan. La tabla permite buscar por nombre, email, teléfono, empresa o estudio, filtrar particular/empresa y recorrer páginas de 50 cuentas. Los filtros y la página quedan en la URL y funcionan al recargar y retroceder. No se incorporan dependencias ni migraciones.

## Autorización

Se reutiliza `PLATFORM_ADMIN_USER_IDS`, que también protege las consultas generales de Vision360. En Render → servicio web → Environment, debe contener un JSON con los UUID de las cuentas autorizadas, por ejemplo `["00000000-0000-4000-8000-000000000001"]` (ejemplo ficticio; usar el ID real). Conservar los IDs existentes. No usar emails ni habilitar este permiso desde el registro o el perfil. Si la cuenta ya administraba las consultas de la plataforma, no necesita una configuración adicional.

Para identificar el UUID real, usar una sesión de esa cuenta y consultar `/api/v1/auth/session`: `user.id`. No compartir cookies ni `csrf_token`. Guardar la variable en Render y desplegar el servicio. El permiso permanece si esa cuenta confirma un cambio de email, porque se vincula al UUID.

`GET /api/v1/admin/accounts` exige una sesión válida y el permiso de administrador en el backend. Devuelve 401 sin sesión y 403 para usuarios comunes, aunque escriban la URL o llamen a la API directamente. La respuesta lleva `Cache-Control: no-store`. Los parámetros son `q` (hasta 160 caracteres, búsqueda literal sin comodines), `kind` (`all`, `individual`, `company`), `offset` (no negativo) y `limit` (1–100, predeterminado 50).

La respuesta se construye con campos explícitos. No expone contraseñas/hashes, sesiones, tokens, cambios de email pendientes, claves de archivos, fotos privadas ni contenidos de trabajos o recorridos. Esta pantalla es de consulta; no modifica cuentas ni concede acceso a los estudios ajenos.

## Verificación

- Pruebas con PostgreSQL temporal: autorización, rechazo de elevación de permisos, recuentos globales, búsqueda, filtros, paginación, límites y campos de respuesta.
- Playwright contra API real temporal: administrador y cuenta común en contextos distintos; acceso desde sidebar/URL, búsqueda, recarga, retroceso y ancho de pantalla de escritorio/celular.
