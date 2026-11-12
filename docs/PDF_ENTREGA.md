# Documento PDF de entrega

En un trabajo con recorrido publicado, abrir **6 Entregar → PDF de entrega**. El estudio se completa con el nombre del estudio activo (se puede ajustar el nombre comercial para la entrega). Completar contacto que se compartirá y condiciones acordadas; guardar y pulsar **Ver PDF de entrega**. El documento contiene título del trabajo, cliente, enlace clickeable al recorrido, QR del mismo enlace, ubicación publicada con Google Maps cuando existe, condiciones, contacto y referencia del trabajo.

El documento siempre muestra **Fecha de emisión**, correspondiente a la copia que se está generando. Si el trabajo ya tiene una entrega registrada, muestra también **Fecha de entrega** por separado. Generar una copia no registra ni modifica la entrega. El pie identifica la fecha de generación del documento.

**Imprimir / Guardar PDF** abre la impresión nativa del navegador: seleccionar Guardar como PDF, A4 y desactivar encabezados/pies del navegador. La vista previa adapta el contenido a celular; el documento impreso conserva su formato A4 y los textos largos fluyen a varias páginas. La disponibilidad del guardado y el nombre de las opciones dependen del navegador/dispositivo. No hay envío automático al cliente ni PDF almacenado en el servidor.

## Datos y permisos

- `service_requests.delivery_document` guarda únicamente estudio, contacto para el cliente y condiciones en JSONB nullable. Los trabajos anteriores no reciben condiciones inventadas. Migración aditiva `0018_delivery_document`: `alembic upgrade head`.
- `PUT /api/v1/organizations/{organization_id}/jobs/{request_id}/delivery-document` exige CSRF, permisos de escritura en el cliente y revisión vigente del trabajo. Incrementa `work_revision` y registra el cambio en su historial. Lectores pueden consultar una ficha ya preparada; no pueden modificarla. Se puede corregir el documento de un trabajo finalizado sin reabrirlo ni cambiar su fecha de entrega.
- La ubicación sale del snapshot **publicado y activo**, conservando el destino anterior mientras haya cambios sin publicar. La URL mantiene la lógica de direcciones/Google Maps existente; no se exige latitud/longitud. Si falta ubicación se omite el bloque de Maps.
- No se copian notas operativas, contacto privado del pedido, datos de acceso ni información de otros trabajos. El contacto que se comparte se escribe explícitamente en la ficha. Los datos del documento no se agregan al manifiesto público del recorrido.
- El texto de condiciones es informativo: no implementa acuerdos firmados, cobros, recordatorios, renovación ni despublicación automática. Las condiciones deben corresponder a lo que realmente puede ofrecer el fotógrafo.

Cambiar una publicación conservando el enlace actualiza lo que el destinatario abre desde el PDF. Cambiar condiciones, contacto o ubicación requiere generar y entregar otro PDF: los documentos ya descargados no se actualizan. El recorrido sigue necesitando Internet y alojamiento; el PDF no guarda las fotografías ni una copia navegable.

## Implementación y pruebas

La generación usa HTML/CSS de impresión y el QR existente; no agrega dependencias, llamadas a terceros ni servicios pagos. El módulo se carga sólo al entrar en Entrega. La interfaz y las etiquetas del documento están disponibles en español y portugués; los datos escritos por el usuario se conservan en su idioma original.

Pruebas con PostgreSQL temporal verifican permisos, validaciones, conflictos de revisión, persistencia y ubicación de la versión publicada. Playwright recorre un trabajo real en escritorio y celular: guarda/recarga las condiciones, valida el QR, los enlaces, la vista previa y el diálogo de impresión; genera un PDF de prueba con enlaces activos y comprueba el cambio de idioma sin traducir condiciones del cliente.


## Identificación y nombre de archivo

Dentro de **PDF de entrega**, una ficha compacta muestra automáticamente el cliente, el título del trabajo, el estudio/fotógrafo responsable y la referencia completa del trabajo. Cliente, título y referencia salen del trabajo que se está consultando, sin volver a seleccionarlos ni escribirlos. El estudio usa el nombre activo al preparar un documento nuevo y conserva el responsable guardado para documentos ya preparados. Al guardar un cambio de responsable, la ficha y las próximas copias muestran el dato actualizado.

El PDF contiene la misma identificación, además de las fechas de emisión y entrega cuando corresponde. La vista previa sugiere un nombre como `Entrega_Remax_Casa-Palermo_2026-11-12_a1b2c3d4.pdf`, con cliente, trabajo, fecha local de emisión y los primeros ocho caracteres de la referencia. Se normalizan los acentos y los caracteres que no convienen en un nombre de archivo; los nombres originales siguen intactos dentro del documento. La referencia completa permanece visible en el PDF.

El título temporal de impresión usa ese nombre para que el navegador pueda proponerlo al guardar. El nombre final se puede elegir en el diálogo del navegador; no es una descarga directa con nombre obligatorio. Al cerrar la vista previa se restaura el título de la página.

Los datos guardados siguen permitiendo volver a abrir la vista previa y generar otra copia. No se almacena un archivo PDF ni un historial de versiones del documento en el servidor. Esta mejora no requiere migraciones ni dependencias nuevas.


Validación de identificación: build de producción, TypeScript y catálogo español/portugués aprobados. Las dos pruebas de permisos/persistencia del documento y los dos casos del trabajo completo en Chrome de escritorio y Pixel 7 emulado pasaron, con PostgreSQL y almacenamiento temporales. Se verificaron la ficha antes y después de recargar, el estudio precompletado y el responsable guardado, las fechas, el nombre sugerido con títulos que contienen comillas y símbolos, el título de impresión/restauración, el PDF generado, el QR y los enlaces al recorrido y Google Maps. También se revisaron la vista previa móvil y la impresión.
