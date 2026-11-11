# Flujo guiado para operar el servicio

El panel abre en Trabajos tanto desde `/` como desde `/studio`. La navegación principal tiene cuatro entradas: Trabajos, Organizaciones, Particulares y Clientes. En móvil se usa el mismo menú desplegable. Configuración y su pantalla de accesos al flujo anterior están retiradas temporalmente, incluida la bandeja Solicitudes Studio. Se conservan los módulos, APIs y datos; el formulario público sigue registrando solicitudes. Los permisos y la separación por organización siguen siendo los existentes.

## Un trabajo, seis pasos

1. **Datos:** el cliente es la organización o el particular seleccionado. El formulario de Nuevo trabajo permite completar o reutilizar un contacto y prepara propiedad y recorrido con la transacción existente. Los contactos guardados se precargan y siguen siendo editables para el pedido. La reutilización de propiedades y recorridos queda desplegable. El paso Datos permite consultar el pedido y abrir sus registros asociados.
2. **Visita:** fecha y notas operativas, guardar y continuar a fotos. Confirmar trabajo es una acción explícita, disponible cuando no hay notas pendientes de guardar. El resto de los estados continúa dentro de Cambiar estado del trabajo.
3. **Fotos:** ambientes, archivos, orden e inicio. El botón Continuar a conexiones se habilita cuando hay al menos un ambiente y todos tienen una panorámica validada. Los pasos siguen pudiendo consultarse libremente; la API mantiene las validaciones finales.
4. **Conexiones:** elegir un ambiente y crear o editar sus puntos. La lista guardada muestra origen y destino con Editar y Eliminar. Al guardar una conexión se ofrece Crear también la vuelta: abre la otra foto, completa el destino anterior y exige elegir posición antes de guardar. Si ya hay una conexión de regreso, abre esa conexión para editarla, sin duplicarla. La vuelta sólo se persiste al pulsar Guardar punto.
5. **Revisar:** previsualización, datos públicos desplegables y publicación. El enlace local se identifica como tal. Continuar a entrega se habilita después de publicar. Las validaciones de alcance, imágenes e inicio se mantienen en la API de publicación.
6. **Entregar:** abrir/copiar el enlace y marcar explícitamente el trabajo como listo para entregar. Esto cambia su estado a PUBLICADO; no publica por sí mismo ni envía mensajes. A continuación se muestra la confirmación y el detalle de entrega. El registro final conserva las comprobaciones de publicación vigente, revisión y nota. Con cambios pendientes se ofrece volver a publicar; al finalizar permanece el comprobante de entrega.

La cabecera diferencia el estado del trabajo del estado del recorrido. El paso activo se identifica con `aria-current="step"`. Cambiar de paso o volver a la lista avisa si existe un punto, nota de visita o detalle de entrega sin guardar. Estado e historial quedan plegados. Se conserva la navegación entre ambientes del visor y la previsualización de lectura.

Al abrir un trabajo publicado se muestra Entregar; con visita agendada se muestra Fotos; en los demás casos se muestra Visita. La selección del paso es de interfaz, no un nuevo estado del negocio. Se vuelven a consultar los datos del trabajo al cambiar de paso para reflejar publicación y cambios pendientes.

## Alcance técnico

Cambios de frontend usando React y Tailwind ya instalados, sin dependencias ni endpoints nuevos. La migración `0008_individuals` amplía la restricción de tipos para admitir Particular, sin reclasificar ni borrar datos. Se reutilizan las APIs de trabajos, clientes, escenas, puntos y publicaciones. No se alteran cuentas, fotos, publicaciones o datos existentes para aplicar esta interfaz. Los recorridos de organizaciones siguen accesibles desde sus fichas. El acceso a recorridos personales desde Configuración queda retirado temporalmente.

## Verificación

TypeScript y build de producción aprobados. Pasaron los 12 casos del panel en Chrome escritorio y móvil emulado mediante el runner de API/PostgreSQL temporal (150,48 s): clientes y aislamiento entre organizaciones, eliminación con confirmación, permisos de lectura, solicitudes Studio, flujo guiado completo, ida/vuelta sin duplicados, edición y aviso de cambios pendientes, publicación y entrega, recorridos personales anteriores, recarga, orientación, republicación y despublicación. La ejecución focalizada previa del asistente también pasó en ambos tamaños (54,56 s). Se inspeccionaron capturas de visita, conexiones y entrega y se comprobó el ancho de la pantalla móvil final. Los archivos sintéticos, cuentas y base de estas pruebas son temporales.

La suite independiente del visor técnico `/visor` no se repitió en esta entrega; sus fallos de temporización documentados en la revisión anterior no se consideran resueltos por estos cambios. Safari y teléfonos físicos siguen pendientes. No hay comando de lint configurado.

## Organizaciones y particulares

Organizaciones está en el sidebar y lista los espacios de inmobiliarias y empresas accesibles por membresía. Abrir Remax muestra Recorridos de Remax, con sus borradores y publicados. Particulares lista los espacios de personas (`kind=individual`): al abrir Fernando se muestran exclusivamente sus recorridos. Los tipos anteriores, incluidos los estudios y fotógrafos profesionales, conservan su clasificación y aparecen en Organizaciones. No se trasladan recorridos desde un cliente o estudio existente por coincidencia de nombre.

Cada ficha ofrece Nuevo trabajo, que abre el formulario con el espacio correcto y el nombre del contratante precargado. Si ya existe un cliente con ese nombre dentro del espacio, se selecciona para reutilizarlo; el selector permite elegir otro. La creación mantiene la transacción existente de cliente, propiedad, recorrido y trabajo. La creación directa de recorridos sigue disponible en Crear recorrido sin trabajo, plegada. No se crean cuentas de acceso para las empresas o personas registradas: la ficha agrupa sus proyectos bajo los permisos del operador.

Crear particular usa el nombre de la persona y la categoría Particular. Mantiene los permisos, el aislamiento, las cuotas y el límite existente de espacios propios de la organización. La base local se actualizó a `0008_individuals`: se compararon conteos antes/después en las 15 tablas de aplicación, sin diferencias. El downgrade se detiene si existen particulares para evitar reclasificarlos o borrar datos.

Validación del directorio de organizaciones y particulares: TypeScript/build aprobados, 15 pruebas de backend de negocio/trabajos correctas y 14 casos del panel en Chrome escritorio y móvil emulado aprobados (170,82 s). Incluyen nueva categoría, aislamiento por membresía, dos recorridos de una misma inmobiliaria, particular separado, reutilización del cliente, selección correcta al iniciar un trabajo, recarga y los flujos anteriores de edición/publicación/entrega. La prueba focalizada del directorio también pasó en ambos tamaños (34,02 s). Frontend y backend locales respondieron 200 y la API activa admite la nueva categoría.

## Eliminar sin perder trabajos

Eliminar cliente ahora lo retira de la agenda aunque tenga propiedades o trabajos vinculados. Es una eliminación lógica (`deleted_at`): el registro histórico permanece, y el trabajo sigue mostrando su nombre/contacto, estado, visita, notas, entrega y recorrido. No se cortan las relaciones de la propiedad ni se modifican publicaciones. El cliente ya no se ofrece al preparar trabajos nuevos y no puede editarse ni volver a vincularse desde la API. Los contactos activos pueden seguir creándose con un nombre reutilizado, conservando identificadores independientes.

Eliminar organización o particular exige ser propietario y una confirmación que explica la conservación de datos. Desaparece de Organizaciones/Particulares y de los directorios activos. En Trabajos sigue disponible en el selector con la indicación «eliminada»: permite continuar los trabajos existentes y consultar sus recorridos e historial con los mismos permisos. Ver recorridos conservados también permite encontrar recorridos sin trabajo. El enlace público de un recorrido publicado sigue funcionando.

Las organizaciones eliminadas no admiten nuevos trabajos, clientes, propiedades ni recorridos. El backend bloquea estas creaciones y la interfaz oculta las acciones. Se siguen pudiendo completar fotos, conexiones, revisiones y entregas de trabajos existentes; la membresía continúa controlando el acceso y puede revocarse. Los cambios de estado no se disparan por eliminar. El espacio eliminado deja de contar para el límite de organizaciones activas propias, conservando sus registros y archivos históricos.

`DELETE /organizations/{id}` y `DELETE /organizations/{id}/clients/{client_id}` responden 204 y exigen sesión, CSRF y permisos. La eliminación del cliente admite roles de escritura; la de organización exige propietario. `GET /organizations` lista activas y `?include_deleted=true` incluye el historial de espacios de los que la cuenta siga siendo miembro. WorkResponse expone `client_deleted` y conserva `client_name` para identificar la referencia eliminada. No se agrega un acceso global a organizaciones de otras cuentas.

La migración `0009_deletions` agrega dos columnas anulables. Se aplicó a la base local sin eliminar ni marcar registros: se compararon conteos de las 15 tablas antes/después y todas conservaron sus cantidades. El downgrade se bloquea si hay eliminaciones registradas, para evitar volver a mostrarlas accidentalmente. El borrado físico, restauración y limpieza de archivos históricos quedan fuera de esta entrega.

Validación de eliminación con conservación: TypeScript/build correctos; suite completa de backend con 80 pruebas aprobadas (29,11 s), incluidas 19 pruebas focalizadas de negocio, trabajos y eliminación. La prueba real del servicio completo con eliminación posterior de cliente/organización pasó en escritorio y móvil (62,17 s), y los 14 casos del panel pasaron en una ejecución final (181,18 s). Se verificaron cancelación, retiro de listas activas, referencias históricas, fotos, edición, historial de entrega, enlace público anónimo, revocación de permisos y bloqueo de creaciones nuevas en espacios eliminados. Las pruebas usaron bases y almacenamiento temporales. Los servidores locales respondieron 200 y la API activa expone la eliminación histórica. No se eliminó ningún registro real del usuario para esta implementación.

## Clientes: una sola identidad por contratante

Clientes ahora es una cartera global de las organizaciones y particulares activos accesibles por membresía. Lee la misma lista de espacios; no crea otro registro ni necesita que exista un trabajo para mostrar la ficha. Tiene búsqueda por nombre y filtro Todos / Organizaciones / Particulares, con una ficha por identificador. Ver recorridos abre la ficha en su sección de origen; Ver trabajos conserva el espacio seleccionado. No muestra Nuevo cliente ni un formulario de alta separado.

Las altas se realizan exclusivamente desde Organizaciones o Particulares. Eliminar cliente desde la cartera elimina lógicamente esa misma ficha de su directorio de origen, con confirmación y permiso de propietario; conserva trabajos, recorridos y enlaces mediante la política de 0009. No elimina un segundo registro de contacto independiente.

La cartera se presenta como una tabla compacta con columnas Cliente, Tipo y Acciones. Cada fila conserva Ver recorridos, Ver trabajos y Eliminar (sólo para propietarios), con etiquetas accesibles que identifican al cliente. La búsqueda y el filtro por tipo se mantienen. En pantallas pequeñas la tabla se desplaza horizontalmente dentro de su contenedor, sin ensanchar la página.

En Nuevo trabajo se usa la ficha del particular u organización: el contacto se muestra como resumen y no se vuelve a pedir nombre, email ni teléfono. Se retiraron Contacto guardado y Usar una propiedad o recorrido existente del formulario. La localidad de la ficha se propone para el inmueble y puede cambiarse. La información de contacto se actualiza desde Ver ficha; email y teléfono siguen siendo opcionales. La cabecera del trabajo identifica al contratante. Propiedades usa Contacto asociado. La pantalla antigua de altas y edición de contactos dentro de la cartera se retiró.

Las tablas y APIs históricas de contactos (`business_clients` y `/organizations/{id}/clients`) se conservan para las referencias y operaciones existentes; no se fusionaron ni borraron datos. La vista de Clientes usa los identificadores de organizaciones/particulares, no los de esos contactos. Es una actualización de frontend sin migraciones, dependencias ni cambios de permisos del backend.

Validación de la cartera unificada: TypeScript/build aprobados. Los dos casos específicos de Clientes en escritorio y móvil pasaron (26,04 s); la ejecución final de los 14 casos del panel pasó (168,97 s), incluyendo altas por tipo, búsqueda/filtros, ausencia de alta duplicada, navegación, eliminación de la misma ficha con conservación de trabajos entregados, publicación y permisos. Se inspeccionó la cartera en móvil y se comprobó que no desborde. Sin cambios de esquema, dependencias ni datos del usuario.

## Crear una ficha sin cambiar de pantalla

Crear organización o particular guarda la ficha y mantiene abierto el directorio. Limpia el formulario y muestra una confirmación; no abre automáticamente sus recorridos ni otra ficha. Cada tarjeta ofrece «Ver recorridos de [nombre]» para entrar por decisión del usuario. El espacio recién creado queda disponible como contexto de Trabajos.

En las colecciones del servicio, «Nuevo trabajo» es la entrada para preparar otra visita. Se retiró «Crear recorrido sin trabajo», que permitía crear solamente un tour sin la gestión de visita y entrega. La colección ocupa el ancho disponible. Los recorridos de organizaciones existentes siguen accesibles. Posteriormente se retiró Configuración, por lo que la creación directa de recorridos personales ya no tiene acceso en el panel. No hay cambios de backend ni migraciones.

Validación: TypeScript y compilación de producción aprobados. Los 14 casos del panel en escritorio y móvil pasaron mediante la prueba integrada con API y PostgreSQL temporales (177,53 s). Las pruebas de directorios verifican que el alta mantenga la lista abierta, limpie el nombre, confirme la creación y requiera abrir la ficha explícitamente; también comprueban la ausencia de la opción sin trabajo y la separación de recorridos por contratante. Sin cambios en los datos reales.

## Retiro temporal de Configuración

Se eliminó el botón del sidebar y el renderizado de la pantalla, junto con las vistas de recorridos personales y solicitudes que sólo se abrían desde allí. El flujo de Trabajos, los directorios y Clientes se mantienen. No se modifican datos ni permisos del backend. Los escenarios de navegador del antiguo panel se conservan como omitidos con motivo explícito; el escenario de Clientes verifica la ausencia de Configuración en el menú y mantiene la búsqueda, filtros, navegación y eliminación.

Validación del retiro: compilación de producción y TypeScript correctos. Los cuatro casos de Clientes y directorios pasaron en escritorio y móvil; tras actualizar la expectativa del menú de cinco a cuatro entradas, los dos casos del trabajo completo pasaron (63,17 s), incluyendo fotos, conexiones, publicación, entrega y conservación tras eliminar el contratante. Se usaron PostgreSQL y almacenamiento temporales. Los escenarios de Configuración retirados no se contabilizan como aprobados.

## Estudio propio y clientes

Cada cuenta tiene un estudio independiente visible en la cabecera. Editar estudio cambia su nombre; Organizaciones y Particulares registran a sus contratantes. El selector de Trabajos ahora se llama Cliente del trabajo. Todas las listas se filtran por el estudio activo. Los clientes compartidos conservan permisos específicos y no revelan la cartera completa de otro negocio. No se reincorpora Configuración. Ver [ESTUDIOS.md](ESTUDIOS.md) para migración, aislamiento, pruebas y límites de esta primera entrega.

## Navegación con historial

El panel utiliza direcciones propias bajo `/studio/trabajos`, `/studio/organizaciones`, `/studio/particulares` y `/studio/clientes`. El detalle de trabajo agrega su identificador al path. La URL conserva estudio, cliente, paso del trabajo y recorrido abierto; los filtros de Clientes y el estado/página de Trabajos también se conservan. No se guardan contraseñas, objetos de trabajo ni respuestas privadas en history.state.

Los botones Atrás y Adelante del panel usan el mismo historial que el navegador. Una navegación nueva después de retroceder descarta la rama de avance. Buscar clientes reemplaza la entrada actual para no generar una página por letra. Se intenta restaurar la posición al volver, esperando la carga del contenido, y se enfoca el contenido principal sin desplazarlo por ese foco.

Recargar o abrir una dirección del panel consulta nuevamente la API y conserva el destino y el paso. El estudio de la URL se valida contra los estudios accesibles por la cuenta; un estudio ajeno conduce al espacio propio. Clientes, trabajos y recorridos se resuelven con sus permisos existentes. Los errores de fichas eliminadas o inaccesibles se muestran sin exponer información ajena. Un recorrido directo debe pertenecer al cliente indicado.

Los formularios de alta de cliente y trabajo, nombre del estudio, propiedad, colaboradores, datos del recorrido, ambientes, conexiones, notas de visita y entrega, y las cargas seleccionadas/en curso bloquean la salida si tienen cambios pendientes. Cancelar la confirmación conserva formulario e historial; aceptar descarta sólo lo no guardado. Cerrar o recargar la pestaña usa el aviso nativo del navegador. Los controles internos del visor para mirar o cambiar de ambiente siguen funcionando dentro de la misma página.

Se usa History API y el estado existente de React, sin dependencias nuevas ni cambios de backend o base de datos. Las URLs del frontend necesitan el fallback habitual de SPA al desplegarse. Configuración continúa retirada.

Validación de navegación: TypeScript y compilación de producción aprobados. Los seis casos de Clientes, directorios y estudios pasaron en escritorio y móvil. Los dos casos del servicio completo pasaron tras actualizar la expectativa de recarga (62,17 s). La verificación final de historial en escritorio y móvil pasó en 31,23 s: Atrás/Adelante, filtros, recarga de trabajos y pasos, protección y descarte de borradores, cambio de cliente desde un recorrido y retorno al cliente después de guardar un trabajo, sin reabrir el formulario enviado. Las nuevas rutas locales de Trabajos, Organizaciones y Clientes respondieron 200. Las pruebas usaron PostgreSQL y almacenamiento temporales; no se modificaron datos reales ni se agregaron dependencias.
