# Archivo PDF de entrega

En **Trabajos → 6 Entregar → PDF de entrega**, preparar los datos del documento: estudio/fotógrafo, contacto compartido y condiciones. Pulsar **Guardar datos del PDF** y después **Generar y guardar PDF**. El servidor genera un archivo PDF real y lo conserva en el almacenamiento privado configurado.

Una vez generado, la sección muestra una tarjeta con el nombre del archivo, su fecha de generación, tamaño y botones **Ver PDF** y **Descargar PDF**. Los datos quedan plegados en **Editar documento**. Recargar, cerrar sesión o volver a entrar no requiere generar el PDF otra vez: se descarga el mismo archivo guardado. El archivo descargado se puede enviar al cliente por el canal habitual; la dirección privada de descarga del panel requiere una sesión autorizada.

## Datos, archivo y reemplazo

Los datos del documento y el archivo son elementos distintos. Editar contacto o condiciones guarda los datos, pero no modifica el PDF existente. **Generar nuevo PDF** pide confirmación y reemplaza el archivo guardado por una copia nueva. Las copias descargadas anteriormente no cambian. Se conserva un archivo actual por trabajo; no se ofrece un historial de versiones del PDF.

Si falla la generación o el almacenamiento, el archivo anterior se conserva. La revisión del trabajo y el identificador del archivo esperado evitan que dos generaciones concurrentes reemplacen una copia más reciente. El objeto anterior se elimina del almacenamiento después de confirmar el nuevo registro; si esa limpieza falla, se registra el incidente para su revisión, sin impedir la descarga del archivo nuevo.

Los trabajos anteriores conservan sus datos y condiciones. Como los PDF creados antes de esta mejora se imprimían desde el navegador y no se almacenaban, hay que pulsar **Generar y guardar PDF** una vez para que aparezca el archivo descargable dentro del trabajo.

## Contenido y acceso

El PDF contiene el título del trabajo, cliente, estudio emisor, fechas de emisión y entrega cuando corresponde, enlace público al recorrido, QR del mismo enlace, ubicación publicada con Google Maps cuando existe, condiciones, contacto y referencia del trabajo. El nombre incluye cliente, trabajo, fecha y una referencia corta, normalizando caracteres inadecuados para un archivo.

La fecha de emisión corresponde al archivo generado. La de entrega es la registrada en el trabajo. Generar o reemplazar el PDF no finaliza el trabajo ni modifica su entrega. El idioma de la interfaz al generar determina las etiquetas del archivo (español o portugués); los textos del cliente no se traducen y cambiar el idioma de la página no cambia un archivo ya guardado.

La ubicación sale del snapshot publicado y activo. No se toman cambios de ubicación pendientes de publicar. No se exige latitud/longitud. No se incluyen notas operativas, el contacto privado del pedido ni credenciales. Los datos del documento y la ruta privada del PDF no se agregan al manifiesto público del recorrido.

El PDF guardado sigue disponible aunque se despublique el recorrido o se quite al cliente de las listas activas. Eso no vuelve a publicar el recorrido: su enlace puede dejar de estar disponible. Para generar un archivo nuevo debe existir una publicación activa. El archivo contiene enlaces y condiciones, no las fotos ni una copia navegable del recorrido.

## Implementación

- Migración aditiva `0020_saved_delivery_pdf`: columna JSONB nullable en `service_requests`, sin modificar trabajos existentes. Actualizar con `alembic upgrade head` desde `backend`. El arranque habitual del contenedor aplica las migraciones.
- `delivery_document` conserva estudio, contacto y condiciones. `delivery_file` conserva el identificador, nombre, fecha, tamaño y referencia interna del objeto privado. La API sólo expone nombre, fecha, tamaño e identificador, sin claves de almacenamiento.
- `POST /api/v1/organizations/{organization_id}/jobs/{request_id}/delivery-document/file` exige sesión, CSRF, permisos de escritura y revisión vigente. Recibe la revisión, el archivo esperado y el idioma. Incrementa la revisión y registra el evento en el historial del trabajo.
- `GET /api/v1/organizations/{organization_id}/jobs/{request_id}/delivery-document/files/{file_id}` consulta el archivo guardado. Con `?download=1`, lo entrega como adjunto. En ambos casos exige acceso al trabajo; los lectores autorizados pueden descargar, pero no generar. La revocación del acceso impide nuevas descargas.
- La descarga devuelve `application/pdf`, una disposición segura y `no-store`. No entrega URLs públicas o permanentes del bucket. Un identificador reemplazado deja de resolver, evitando que una dirección antigua descargue silenciosamente un archivo diferente.
- [ReportLab 5.1.0](https://pypi.org/project/reportlab/5.1.0/) genera el PDF y el QR en el backend. Se usan sus fuentes incluidas y se escapan los textos antes de componer el documento. No requiere navegador headless, llamadas externas ni un servicio de PDF pago.
- Los objetos usan el almacenamiento privado existente: local en desarrollo y S3 compatible en producción. `Storage.put` admite el MIME PDF conservando JPEG como valor predeterminado para las fotos. Si el bucket privado restringe los tipos MIME permitidos, debe admitir `application/pdf`. El bucket público de imágenes no recibe estos archivos. Los PDF tienen un máximo de 2 MiB; su tamaño se suma al consumo del estudio y se comprueban los límites activos del plan antes de guardarlos.

No hay envío automático, firma de acuerdos, vencimiento de alojamiento, cobros ni renovación automática en esta funcionalidad.


## Verificación de esta entrega

Compilación de producción, TypeScript, tipos de API y catálogo español/portugués aprobados. Pasaron 76 pruebas de backend seleccionadas (PDF, datos de entrega, suscripciones, fotos, publicaciones, trabajos y despliegue) y los dos casos del trabajo completo en Chrome de escritorio y Pixel 7 emulado. Las pruebas usan PostgreSQL y almacenamiento temporales.

Se comprobaron el PDF binario guardado, el MIME para S3, la igualdad de bytes en descargas repetidas, persistencia después de recargar y editar condiciones, reemplazo confirmado y cancelado, concurrencia, fallo de almacenamiento conservando el archivo anterior, permisos/revocación, cuota, ubicación publicada y conservación después de despublicar o quitar al cliente. En el navegador se descargó el archivo real y se comprobó que los datos queden plegados. También se renderizó el PDF descargado y se decodificó su QR, que coincidió con el enlace de la visita.

La migración aditiva se aplicó al PostgreSQL local. En Render se aplicará con el arranque del contenedor al desplegar el commit. No se generaron ni reemplazaron archivos de trabajos reales durante las pruebas.
