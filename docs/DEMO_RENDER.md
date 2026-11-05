# Demo en Render, hasta 30 días

## Estado

Preparación local. No se han creado recursos de Render ni almacenamiento remoto.
No se copian las cuentas, fotos ni datos de desarrollo al demo: se registra una
cuenta nueva y se cargan sólo datos de prueba.

## Diseño

`render.yaml` declara un Web Service Free y un PostgreSQL Free. El Dockerfile
compila React y FastAPI sirve el frontend y la API bajo el mismo dominio HTTPS.
Las cookies Secure y CSRF conservan su validación; no hace falta Vercel.

`VISTA360_DEMO_MODE=true` activa un supervisor: primero valida variables y ejecuta
Alembic; después inicia API y worker como procesos separados dentro de la misma
instancia. Si uno termina, el supervisor detiene ambos y falla para que Render
reinicie el servicio. Las señales de cierre alcanzan también los validadores de
imágenes. No se agregan peticiones artificiales para mantener despierto el servicio.
El modo normal `web` y el worker independiente se conservan para otros despliegues.

El demo admite JPEG 2:1 de hasta 4096×2048 y 10 MiB, con cuotas reducidas. Estas
variables no cambian los límites locales. La instancia gratuita tiene recursos
limitados: no usarla para carga simultánea intensiva ni imágenes de mayor tamaño.

## Pasos, en este orden

1. Crear el workspace **Vision360 Demo** en Render, sin contratar planes pagos.
2. Preparar almacenamiento S3 compatible externo: un bucket privado para originales
   y derivados de trabajo, y otro público para las copias publicadas. Un proveedor
   posible para la prueba es Supabase Storage Free; requiere un proyecto propio,
   credenciales S3 del servidor y validación real antes de ofrecer el enlace.
   No activar un plan pago. El bucket público sólo debe recibir imágenes publicadas.
3. Subir el código preparado al repositorio de GitHub, revisando que `.env`, claves
   y fotos privadas estén excluidos. El deploy debe usar la raíz del repositorio.
4. Desde el workspace nuevo: **New → Blueprint**, conectar el repositorio y revisar
   `render.yaml`. Ambos recursos deben indicar **Free** antes de confirmar.
5. Completar las variables marcadas `sync: false` desde las credenciales del
   proveedor de almacenamiento. No pegar las claves en Git ni en el chat.
6. Desplegar. Render genera el dominio HTTPS y `RENDER_EXTERNAL_URL`; el supervisor
   usa ese origen exacto para CSRF/CORS. Las migraciones se ejecutan al arrancar,
   sin depender del pre-deploy command de pago. Mantener una sola instancia.
7. Comprobar `/health`, `/studio`, registro, inicio/cierre de sesión, fichas de
   clientes, trabajo, carga de JPEG, validación, conexiones y publicación.
   Abrir el enlace en incógnito y en un celular; probar «Mirar con el celular».
8. Reiniciar el servicio y comprobar que datos, imágenes y enlace se conservan.

Si se usa Supabase Storage, el endpoint S3 es el que indique su panel, el bucket
privado permanece privado y `PUBLIC_MEDIA_BASE_URL` tiene el formato
`https://PROYECTO.supabase.co/storage/v1/object/public/vision360-demo-public`.
Usar las credenciales S3 de Storage, no las claves públicas anon/publishable.
Validar PUT/GET firmados, CopyObject entre buckets, entrega pública y CORS real
desde el dominio final. No dar por listo el almacenamiento sólo por guardar claves.

## Límites y conservación

- Render suspende el Web Service Free después de 15 minutos sin tráfico; API y
  worker se detienen juntos. Al volver a abrir la app se reanudan y la cola
  PostgreSQL conserva tareas pendientes. Una tarea interrumpida puede esperar
  el vencimiento de su lease antes de volver a ejecutarse.
- PostgreSQL Free vence 30 días después de su creación. Exportar una copia antes
  del vencimiento: no tiene backups gratuitos gestionados. Conservar también los
  objetos de ambos buckets; el dump SQL no incluye fotos.
- Supabase Free incluye 1 GB de archivos y puede pausar proyectos inactivos.
  Vigilar almacenamiento y transferencia totales de todas las cuentas del demo;
  las cuotas por usuario de Vision360 no son una cuota global del proveedor.
- El demo sigue abierto a registro como la app actual. Compartirlo con un grupo
  pequeño y datos ficticios. No usar información sensible para evaluar el sistema.
- No es una instalación permanente ni tiene disponibilidad garantizada. Al cerrar
  la prueba, exportar lo necesario y eliminar sólo los recursos del demo.

## Fuentes oficiales

- [Render Free: descanso, discos y PostgreSQL por 30 días](https://render.com/docs/free)
- [Blueprint y variables de entorno](https://render.com/docs/blueprint-spec)
- [Supabase: precios y límites gratuitos](https://supabase.com/pricing)
- [Supabase: protocolo S3](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Supabase: credenciales S3](https://supabase.com/docs/guides/storage/s3/authentication)
