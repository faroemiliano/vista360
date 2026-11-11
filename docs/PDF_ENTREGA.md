# Documento PDF de entrega

En un trabajo con recorrido publicado, abrir **6 Entregar → PDF de entrega**. Completar estudio/fotógrafo responsable, contacto que se compartirá y condiciones acordadas; guardar y pulsar **Ver PDF de entrega**. El documento contiene título del trabajo, cliente, enlace clickeable al recorrido, QR del mismo enlace, ubicación publicada con Google Maps cuando existe, condiciones, contacto y referencia del trabajo.

La fecha se presenta como **Fecha de entrega** cuando ya se registró la entrega. Antes de ese momento se indica **Fecha de emisión**, sin dar el trabajo por entregado. El pie identifica la fecha de generación del documento.

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
