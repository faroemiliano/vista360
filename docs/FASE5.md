# Fase 5 — Editor y recorrido conectado

Se agrega edición persistente de puntos de navegación e información, guardado visual de orientación inicial y previsualización privada del borrador. Se mantiene la UI provisional. No incluye publicación ni enlaces públicos.

## Probar con tus fotos

Con PostgreSQL, API y frontend activos, abrir http://localhost:5174 e ingresar. El worker se necesita para nuevas cargas; las imágenes ya aprobadas pueden visualizarse sin él.

1. Crear dos ambientes, por ejemplo Living y Cocina. Cargar una panorámica válida en cada uno; para probar se puede usar el mismo JPEG.
2. Pulsar **Conectar Living**. Arrastrar para mirar y ajustar zoom. **Guardar vista actual como inicial** persiste yaw, pitch y campo de visión.
3. Activar **Ubicar punto** y tocar la imagen sin arrastrar. Aparece una cruz ámbar con la etiqueta **Sin guardar**, proyectada sobre el lugar elegido. Tocar otra posición mueve esa misma marca sin guardar ni crear puntos adicionales. También se puede usar **Nuevo punto en el centro**, accesible con teclado.
4. Elegir **Ir a otro ambiente**, escribir una etiqueta como «Ir a Cocina» y seleccionar Cocina. Pulsar **Guardar punto**.
5. Tocar la flecha sobre el panorama o usar el botón de la lista para entrar en Cocina. Crear allí otro punto hacia Living para permitir volver.
6. Para agregar información, elegir **Información** y escribir título/texto. Todo se muestra como texto plano, sin HTML.
7. Los puntos se pueden editar, reubicar tocando otra posición o eliminar desde la lista. Durante la edición se muestra la marca provisional en lugar del punto guardado que se está modificando. Cancelar restaura el original sin guardar cambios; **Guardar punto** confirma la última ubicación y sustituye la cruz por el punto definitivo. Arrastrar sigue girando el panorama y no reubica la marca. Cambiar ambiente o cerrar con un formulario pendiente requiere descartar sus cambios.
8. Cerrar el editor y pulsar **Previsualizar recorrido**. Comienza por el ambiente inicial del tour y permite navegar por puntos o lista. Recargar y volver a abrir conserva las conexiones y la orientación.

Cada enlace es direccional. Una escena sin panorama sigue visible en la lista con su estado y no intenta descargar una imagen inexistente. La previsualización requiere la sesión del propietario y no genera una URL compartible. Guardar borrador todavía no publica nada.

## Backend y datos

La migración aditiva `0004_hotspots` crea `hotspots`. Cada punto tiene UUID, tour/escena origen, tipo, yaw/pitch, etiqueta y destino o contenido `{text}`. FKs compuestas mantienen origen y destino dentro del mismo recorrido. CHECKs controlan coordenadas y forma básica del payload; Pydantic rechaza campos adicionales, infinitos, texto vacío y combinaciones inválidas.

API bajo `/api/v1/tours/{tour_id}/scenes/{scene_id}/hotspots`: GET/POST lista/crea y PUT/DELETE `/{hotspot_id}` edita/elimina. Todas las rutas comprueban propietario; las mutaciones requieren CSRF. Cada cambio bloquea el tour y aumenta su revisión. Se limita a 100 puntos por ambiente; navegación al mismo ambiente se rechaza para evitar enlaces sin efecto.

`GET /api/v1/tours/{tour_id}/scenes/{scene_id}/deletion-impact` devuelve cantidad de conexiones entrantes. DELETE de escena rechaza con 409 mientras existan, salvo `?delete_connections=true`. La interfaz consulta el impacto y lo incluye en la confirmación. Eliminación confirmada borra conexiones entrantes, puntos propios y programa limpieza de archivos. El bloqueo del tour serializa borrado y nuevas conexiones; no deja destinos colgantes.

La previsualización reutiliza las APIs privadas de escenas, assets y puntos. Se renuevan fuentes privadas al entrar en cada ambiente y se descarga únicamente la imagen activa. No se implementa un snapshot ni un endpoint público anticipado. El adaptador del visor expone la vista actual sin acoplar el dominio a Pannellum. No se añaden dependencias.

## Ejecutar y verificar

Desde backend, con el entorno virtual activo:

```sh
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend, en otra terminal: `cd frontend` y `npm run dev`. Worker para nuevas fotos, desde backend: `python -m app.processing.worker`. Configuración y comandos completos en README.

```sh
# backend, PostgreSQL local activo; bases de prueba temporales
python -m pytest -q
RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome python -m pytest -q

# frontend
npm run generate:api
npm run build
```

Las pruebas backend cubren CRUD, revisión del tour, direccionalidad, aislamiento entre usuarios, CSRF, destino cruzado rechazado por API y FK, validación y eliminación con impacto. El navegador comprueba dos ambientes con cargas reales, guardado visual de orientación, creación/edición/borrado, ida y vuelta por hotspots, texto plano y persistencia tras recarga. Usan base y archivos temporales, sin modificar los recorridos del usuario.

Resultado del 14/10/2026: 52 pruebas backend aprobadas y orquestación de navegador aprobada por separado, con 23 casos frontend aprobados y una omisión intencional (gesto CDP fuera del proyecto móvil). Chrome escritorio y móvil emulado completaron el recorrido conectado. TypeScript estricto y build Vite aprobados; pip check, SELECT 1, migración `0004_hotspots`, upgrade/downgrade en DB temporal y Alembic sin drift aprobados. Capturas inspeccionadas; se usaron imágenes sintéticas de prueba. Los servicios de desarrollo se conservaron activos.

Pendientes de validación física: Safari/iOS, teléfonos reales, GPU y fotografías de cámaras diversas, según fases anteriores. La UI final sigue pospuesta. La Fase 6 de publicación requiere una nueva aprobación.
