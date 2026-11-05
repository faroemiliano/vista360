# Fase 4 — Ingestión de panorámicas

Se implementan assets, una cola durable en PostgreSQL, almacenamiento local y adaptador S3/R2 opcional. Cada ambiente permite cargar y reemplazar su JPEG y ver la imagen aprobada en privado. La interfaz sigue siendo funcional y provisional.

## Ejecutar y probar

Mantener PostgreSQL, API (8001) y frontend (5174) como indica README. Aplicar `alembic upgrade head` desde backend y ejecutar en otra terminal:

```sh
cd backend
source .venv/bin/activate
python -m pip install -e . -c requirements.lock
python -m app.processing.worker
```

1. Ingresar, abrir un recorrido y agregar o seleccionar un ambiente.
2. Elegir un JPEG equirectangular completo 2:1; pulsar **Subir panorámica**.
3. Esperar carga y validación; pulsar **Ver panorama**.
4. Para reemplazar, seleccionar otro JPEG y repetir. El anterior se conserva hasta aprobar el nuevo.

Una panorámica parcial de teléfono no cubre la esfera. Se admiten JPEG hasta 50 MiB, 16.384 × 8.192 y 135 millones de píxeles. Orientación EXIF rotada debe normalizarse antes de cargar. Yaw/pitch/FOV usan la orientación guardada del ambiente; mover el visor no guarda una nueva orientación automáticamente.

## Flujo e integridad

La migración `0003_assets` agrega `assets`, `processing_jobs` y referencias de panorama activo/pendiente en escenas, con FKs compuestas que impiden cruzar recorridos. La API autoriza siempre por propietario. La carga local usa streaming limitado y archivo temporal registrado; S3 usa PUT firmado de diez minutos. Confirmar comprueba tamaño real y crea una única tarea incluso con solicitudes repetidas.

El worker reclama tareas con `FOR UPDATE SKIP LOCKED`, un lease UUID y vencimiento de cinco minutos. Procesa una imagen por proceso, con decodificación aislada y timeout de dos minutos. Verifica JPEG, proporción, dimensiones, píxeles y corrupción; genera derivados privados de hasta 4096/2048 de ancho, calidad 85, sin EXIF. No agranda imágenes pequeñas. La decodificación reducida JPEG limita buffers; hay que medir memoria con cámaras reales antes de producción.

Original aprobado y derivados se escriben en claves nuevas que la URL de carga no puede modificar. Sólo después de terminar todos los archivos se cambia el panorama activo. Una validación fallida, un lease reemplazado o una carga supersedida no sustituye la imagen anterior. El visor recibe únicamente derivados aprobados y autorizados, nunca el original de staging.

Las claves de cada intento se registran antes de escribirlas para recuperar limpieza tras interrupciones. Reemplazo y eliminación programan tareas durables de borrado; no dependen de una transacción atómica entre disco y PostgreSQL. Cargas pendientes vencidas se revisan cada 30 segundos. En S3 el borrado de staging espera vencimiento de firma más 30 segundos porque PUT puede reutilizarse. Los fallos de infraestructura tienen tres intentos con espera; tareas finalmente fallidas requieren revisión operativa. Detener el worker pausa procesamiento y limpieza, conservando la cola.

## Configuración y decisiones de detalle

- Local por defecto, archivos en `backend/.data/assets/`, excluidos de Git. API y worker deben compartir directorio y base. Producción exige almacenamiento externo.
- Cuotas iniciales configurables: 1 GiB por recorrido y 5 GiB por usuario, reservando 20 MiB adicionales de derivados por original. Máximo tres cargas activas y treinta preparaciones por diez minutos. Son reservas lógicas; archivos pendientes de limpieza pueden ocupar espacio adicional temporalmente.
- `pending_panorama_asset_id`, estados uploading/uploaded y UUID de lease resuelven cargas en curso, reemplazos y recuperación sin introducir Redis/Celery.
- Pillow es necesario para validar/derivar JPEG; boto3 se instala sólo mediante el extra `s3`. Sin nuevas dependencias frontend.
- Se implementa el visor privado de un panorama para comprobar ingestión. El editor conectado, hotspots persistentes y preview del recorrido completo pertenecen a Fase 5.
- Al incorporar publicaciones en Fase 6, la limpieza deberá comprobar también referencias de snapshots retenidos; todavía no existen publicaciones.

## S3/R2 opcional y comprobaciones pendientes

Instalar `python -m pip install -e '.[s3]' -c requirements.lock`. Configurar `STORAGE_BACKEND=s3`, endpoint, bucket privado, región y claves en backend/.env; las credenciales nunca van al frontend. API y worker deben tener la misma configuración. El navegador carga directamente al bucket y lee mediante GET firmado; no usar cookies hacia S3.

Configurar CORS del bucket para los orígenes exactos del frontend, métodos PUT/GET y header Content-Type. Las firmas duran diez minutos; no se guardan en DB. HEAD y lectura limitada comprueban tamaño/contenido, pero un PUT firmado no garantiza impedir que bytes excedidos lleguen al proveedor: limpieza y cuotas complementan esa validación.

La generación de firmas y lectura acotada se verifican con el SDK y respuestas controladas. **No se ha realizado una carga real a S3/R2**: falta configurar la cuenta y comprobar PUT/GET, expiración, CORS y privacidad en el proveedor. No hay bucket público, CDN ni despliegue en esta fase. Safari, dispositivos físicos y fotografías reales siguen pendientes del cierre del visor.

## Verificación reproducible

```sh
cd backend
source .venv/bin/activate
python -m pip install -e '.[dev,s3]' -c requirements.lock
python -m pip check
python -m pytest -q
```

Para incluir navegador, seleccionar Node compatible, instalar Chromium con `npx playwright install chromium` desde frontend y ejecutar desde backend:

```sh
RUN_BROWSER_TESTS=1 python -m pytest -q
```

En este equipo se usa `PLAYWRIGHT_CHANNEL=chrome`. Las pruebas crean y eliminan una base PostgreSQL `_test` y un directorio temporal propios; no vacían datos del usuario. Playwright inicia API, worker y frontend de prueba. Comprueba carga real, aprobación, visor privado, persistencia y CRUD en Chrome escritorio y móvil emulado. El build se verifica con `npm run generate:api` y `npm run build` desde frontend.

Se cubren JPEG corrupto/incompleto, proporción, tamaño, propietario, expiración y archivos parciales, confirmación idempotente, reemplazos, limpieza, leases y timeout.

Resultado local: suite completa de 39 pruebas pytest aprobadas, incluida la orquestación del navegador (21 casos frontend aprobados y una omisión intencional). Se añadieron después dos casos de cuotas y uno de recuperación de storage; las 18 pruebas de ingestión pasaron. TypeScript y build Vite, pip check, SELECT 1 real, migración activa `0003_assets` y Alembic sin drift aprobados. API y frontend existentes siguen activos; se inició el worker local. Las pruebas usaron imágenes sintéticas, no fotos del usuario.

Fase 5 no iniciada. Sin publicación, pagos, captura móvil, stitching, IA ni 3D.
