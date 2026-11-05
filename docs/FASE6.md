# Fase 6 — Publicación versionada

El propietario puede publicar el recorrido, compartir su ruta `/tour/{slug}`, publicar cambios y despublicar. El visitante abre una vista independiente sin registro ni sesión. El panel y la interfaz siguen siendo provisionales.

## Probar ahora en desarrollo

Con PostgreSQL, backend (8001), frontend (5174) y worker activos:

1. Abrir http://localhost:5174 e ingresar al recorrido.
2. Cargar una panorámica validada por ambiente, elegir ambiente inicial y revisar conexiones.
3. Pulsar **Publicar recorrido** y confirmar que fotos/textos podrán ser vistos por quienes tengan el enlace. Si hay ambientes sin conexión desde el inicio, se advierte que sólo se alcanzarán por la lista.
4. Esperar **Versión 1 publicada**. Abrir **Abrir recorrido público** o copiar el enlace.
5. Probarlo en una ventana privada: no requiere iniciar sesión. Permite mirar, usar hotspots y elegir ambientes en la lista.
6. Editar el borrador: la versión pública mantiene lo publicado y el panel muestra cambios pendientes. **Publicar cambios** prepara y activa otra versión.
7. **Despublicar recorrido** retira el documento público y programa la limpieza de imágenes. También cancela una preparación en curso.

El enlace `http://localhost:5174/tour/...` funciona en esta computadora. **No es todavía un enlace accesible por Internet**: requiere desplegar frontend/API/worker y configurar PostgreSQL, dominios y R2/CDN. No se desplegó ni publicó ningún recorrido del usuario automáticamente.

Para arrancar desde la raíz, si los servicios están detenidos:

```sh
docker compose up -d --wait db
```

En terminales separadas:

```sh
cd backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```sh
cd backend
source .venv/bin/activate
python -m app.processing.worker
```

```sh
cd frontend
npm run dev
```

## Transición entre posiciones

Al tocar un hotspot de navegación, el visor gira hacia ese punto y reduce brevemente el campo de visión durante 240 ms. Después carga el destino y aplica una entrada suave de 280 ms, respetando su orientación inicial guardada. En el visor público se conserva la imagen anterior durante la descarga; no se precargan otros ambientes ni se mantienen dos contextos WebGL. La navegación por lista sigue siendo directa. Nuevas cargas o desmontar cancelan el movimiento pendiente; movimiento reducido omite las animaciones. No cambia fotos, conexiones, snapshots ni datos guardados. Para sentir un avance espacial se requieren panorámicas tomadas desde distintas posiciones: no reconstruye geometría ni permite caminar libremente.

Verificación de la transición: build/TypeScript aprobados. El runner completo aprobó 27 casos de navegador, incluidos descarga lenta, movimiento reducido y publicación privada/pública. El caso de cancelación se ajustó para desmontar antes de que termine la animación (el scroll del runner podía consumir ese tiempo) y pasó después en ambos proyectos, escritorio y móvil emulado. Una omisión intencional de CDP se mantiene. Sin dependencias ni migraciones nuevas.

## Versiones e integridad

`0005_publications` crea `tour_publications`, `publication_assets` y la referencia compuesta a publicación activa en tours. Las publicaciones guardan documento propio con `schema_version=1`, número de versión, revisión del borrador y estado. La tabla de referencias de assets impide borrar derivados que necesita una publicación activa o en preparación. Originales y escenas del borrador no se exponen por la API pública.

Antes de publicar se exige al menos un ambiente, inicio válido, panoramas listos, ninguna carga pendiente y conexiones válidas. La API exige confirmar la advertencia de ambientes no alcanzables. El slug queda fijo desde la primera publicación exitosa, incluso tras despublicar, para conservar el enlace.

La petición registra snapshot, referencias, claves de destino y tarea durable antes de copiar. El worker del mismo backend copia sólo derivados aprobados, comprueba lease y revisión del tour en cada tramo y activa la versión después de completar todas las copias. Las escrituras de cada archivo se serializan con ediciones/borrados del tour; la decodificación de panoramas sigue fuera de HTTP. Reintentos usan claves inmutables del mismo snapshot. Fallo final o cambio de revisión retira la preparación y limpia copias parciales; la publicación anterior permanece activa.

Se conserva la versión activa y la preparación; al republicar se retira la versión anterior, se programan borrados públicos y se liberan referencias privadas sin uso. El historial de documentos se mantiene como metadatos, sin prometer restauración de versiones retiradas ni conservar sus imágenes. Borrar un ambiente del borrador no lo elimina del snapshot público. Borrar el tour sí retira su publicación y programa limpieza durable.

Despublicar no recupera archivos descargados ni garantiza revocación inmediata de imágenes en caché. El JSON público se revalida siempre con `ETag` por publicación y `Cache-Control: public, max-age=0, must-revalidate`; la existencia de la publicación se comprueba antes de responder 304. Imágenes versionadas usan caché pública de un año e immutable. Las respuestas privadas y los errores públicos usan no-store.

## Storage local y S3/R2

Local usa un subdirectorio `_public` separado bajo el directorio de assets y un endpoint sólo de desarrollo para imágenes del snapshot activo. No expone estáticamente todo el disco ni sirve originales. Los bytes públicos pasan por FastAPI únicamente en este modo local de prueba; el endpoint local se bloquea en producción.

Para S3/R2 instalar el extra `s3` y configurar en backend/.env (API y worker iguales):

```dotenv
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=vista360-private
S3_PUBLIC_BUCKET=vista360-public
S3_REGION=auto
S3_ACCESS_KEY=replace-with-private-access-key
S3_SECRET_KEY=replace-with-private-secret-key
PUBLIC_MEDIA_BASE_URL=https://media.example.com
```

Son ejemplos sin secretos. Los buckets deben ser distintos, del mismo proveedor/endpoint, y las credenciales deben permitir lectura del privado y copia/escritura/borrado en el público. Mantener privado el bucket original. No habilitar listado público del bucket de entrega. Configurar dominio de medios/CDN y CORS para GET (el visor público no envía cookies); los PUT privados conservan su CORS restringido a los orígenes del frontend. La copia se realiza mediante `CopyObject` dentro del proveedor, sin descargar los bytes por Render. El JSON calcula URLs estables desde el dominio de medios, sin firmas privadas. No cambiar buckets/directorios sin migrar sus archivos y referencias.

Frontend productivo requiere `VITE_API_BASE_URL` HTTPS y fallback SPA para `/tour/{slug}`. API y panel deben mantener sus dominios/cookies compatibles según PLAN.md. Sin bucket público o dominio de medios configurado, S3 rechaza publicar con un mensaje explícito. No se agregó proveedor de hosting ni dependencia nueva.

**Validación externa pendiente:** no se dispone de una configuración R2 real en este entorno. La copia del SDK se verifica con respuestas controladas; falta comprobar en la cuenta real permisos, CORS, CopyObject, entrega CDN, caché y retirada de objetos. También siguen pendientes Safari y dispositivos físicos. El despliegue y preparación productiva pertenecen a Fase 7.

## API y pruebas

Rutas privadas bajo `/api/v1/tours/{id}`: GET `/publication`, GET `/publication/check`, POST `/publish` con revisión esperada y confirmación de advertencias, POST `/unpublish`. Propietario y CSRF se exigen en mutaciones. Repetir una preparación no duplica tareas.

GET `/api/v1/public/tours/{slug}` entrega exclusivamente el documento publicado; responde 404 si no existe o está despublicado. `/tour/{slug}` no consulta identidad ni endpoints del panel y descarga únicamente la imagen del ambiente activo.

Desde backend, con entorno activo y PostgreSQL local:

```sh
python -m pytest -q
RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome python -m pytest -q
```

Desde frontend: `npm run generate:api` y `npm run build`. Las pruebas usan DB y archivos temporales, sin crear tours de prueba en la cuenta del usuario. Cubren borrador aislado, acceso anónimo, autorización/CSRF, retención de archivos, reemplazos, versiones, ETag/304/404, reintentos, cancelación, revisión concurrente y lease perdido. El navegador recorre el snapshot sin cookies, edita el borrador, republica y despublica en escritorio y móvil emulado.

Resultado local del 15/10/2026: suite completa con 60 pruebas pytest aprobadas, incluida la orquestación de 23 casos frontend aprobados y una omisión intencional. Se añadieron después dos verificaciones de idempotencia/inicio de carga concurrente y CopyObject: las 27 pruebas de publicaciones e ingestión pasaron. También se comprobó una copia parcial seguida de fallo, conservando la publicación previa. Build y TypeScript, pip check, SELECT 1, migración `0005_publications` y Alembic sin drift aprobados. Upgrade/downgrade se verifican únicamente en DB temporal. Se inspeccionaron capturas de la vista pública; las pruebas usaron imágenes sintéticas. API, frontend, PostgreSQL y worker actualizado quedaron activos.

La Fase 7 requiere aprobación; no se inicia en esta entrega.
