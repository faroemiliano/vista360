# Estudios independientes en Vision360

Esta entrega separa el negocio que utiliza Vision360 de sus clientes. Sirve para prestar el servicio propio y para que otro profesional trabaje con una cuenta independiente. No implementa suscripciones, cobros ni planes comerciales.

## Jerarquía y uso

Estudio de Ana → cliente Remax → trabajo Casa Centro → recorrido → ambientes y conexiones.

Cada cuenta recibe automáticamente un estudio propio. En esta primera versión hay un titular y un estudio propio por cuenta; no se agrega un sistema nuevo de equipos completos del estudio. El negocio se nombra mediante **Editar estudio** en la cabecera. Organizaciones y Particulares registran a quienes lo contratan; Clientes es su tabla unificada. El selector de Trabajos se llama Cliente del trabajo. Crear una organización guarda una ficha sin abrirla automáticamente. Ya no se ofrece crear un «Studio propio» como tipo de cliente; los tipos anteriores se conservan.

## API y permisos

- `GET /api/v1/workspaces`: estudio propio y estudios con clientes compartidos explícitamente. No expone email ni identificador del titular.
- `PUT /api/v1/workspaces/{id}`: renombrado sólo por el titular, con sesión, CSRF y nombre de 1 a 160 caracteres.
- `GET /api/v1/organizations?workspace_id=…`: exige acceso al estudio y filtra además por las membresías del usuario en sus clientes. También protege `include_deleted=true`.
- `POST /api/v1/organizations`: acepta workspace_id y exige que el usuario sea titular del estudio. Sin ese dato usa su estudio propio para mantener compatibilidad.
- Las rutas por identificador de cliente, trabajo, recorrido, escena y archivo mantienen la autorización por membresía y rol. Conocer un UUID no concede acceso. Los recorridos publicados siguen siendo públicos por diseño.

Las invitaciones anteriores sólo permiten acceder al cliente compartido, nunca al resto de la cartera, renombrado o alta de clientes del estudio ajeno. Se conservan sus roles owner/admin/editor/viewer. Revocar el último cliente compartido elimina también el acceso al estudio correspondiente. No se convierten las membresías de clientes en permisos globales de estudio.

El panel envía workspace_id en sus tres listas: Trabajos, directorios y Clientes. El selector Estudio activo sólo aparece cuando hay más de uno accesible. Cambiarlo limpia cliente y trabajo seleccionados, remonta el contenido y abre Trabajos. Cambiar de cuenta vuelve a cargar los estudios autorizados. La navegación conserva el estudio válido indicado en la URL al recargar; sin un destino específico se elige primero el propio. El identificador del navegador no concede permisos.

La lista de organizaciones sin parámetro conserva su contrato anterior: sólo membresías autorizadas, aunque pertenezcan a varios estudios. El panel siempre envía el filtro. No hay API para mover clientes entre estudios.

## Migración y operación

`0010_workspaces` crea un estudio por cuenta existente, incluida la que no tenga clientes. Agrega organizations.workspace_id no nulo, indexado y con clave foránea. Asigna cada ficha al estudio de su propietario más antiguo; los empates se resuelven por UUID. Todos los demás propietarios conservan sus membresías. Si falta un propietario se detiene antes de modificar el esquema.

Se incluyen fichas activas y eliminadas. No se cambian identificadores, roles, cuentas, nombres de clientes, contactos, trabajos, fotos, notas ni publicaciones; no se mueven archivos. Los recorridos personales conservan su propietario y API, sin inventar clientes ni reincorporar Configuración. El downgrade se bloquea si hay estudios para evitar perder nombres y separación.

Desde backend, antes de ejecutar esta versión:

```sh
.venv/bin/alembic upgrade head
```

Los comandos habituales de frontend, backend y worker se mantienen. API y worker deben usar el código actualizado. En el panel: Editar estudio → nombre del negocio → Guardar estudio. Después registrar contratantes en Organizaciones o Particulares y crear sus trabajos.

Se mantienen los límites técnicos por organización/cliente y el máximo de diez organizaciones activas propias. No son planes ni límites globales de estudio. Suscripciones, facturación, recuperación de contraseña, verificación de email y administración comercial requieren entregas posteriores antes de una apertura comercial amplia.

## Validación

TypeScript y compilación de producción aprobados. Suite de backend: **85 pruebas aprobadas y una de navegador omitida** en esa ejecución. Incluye estudios con clientes del mismo nombre, rechazo de identificadores ajenos, CSRF, validación, ausencia de duplicados al ingresar nuevamente y revocación de accesos compartidos.

El ensayo de migración usa otra base temporal en 0009 con varios propietarios, particulares, fichas eliminadas, cuenta sin clientes, recorrido, ambiente y trabajo históricos; compara todas las columnas previas y ejecuta alembic check.

Los **ocho casos del panel** en escritorio y móvil pasaron en **95,41 s**: dos estudios, renombrado, carteras independientes, cliente compartido de lectura, cambio de estudio y cuenta, y el trabajo completo con fotos, conexiones, publicación, entrega y conservación del historial. Se usaron bases y almacenamiento temporales.

La migración local quedó en 0010_workspaces: **un estudio y seis fichas vinculadas**, sin clientes sin asignar. Los hashes de todos los registros y columnas anteriores de las 15 tablas resultaron idénticos antes y después. Alembic check no detectó diferencias. Backend 8001 y frontend 5174 respondieron 200; la API activa expone las rutas nuevas. No se crearon cuentas ni carteras de prueba en la base real.
