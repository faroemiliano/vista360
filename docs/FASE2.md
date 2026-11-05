# Fase 2 — Prueba del visor

Estado: cierre técnico autorizado por el usuario para avanzar a Fase 3; validación física pendiente. El trabajo de Fase 2 no modificó el backend ni el esquema PostgreSQL. Su demo sigue aislada, sin autenticación, uploads ni publicación.

## Ejecutar la prueba

Desde la raíz, con Node compatible seleccionado:

```sh
cd frontend
npm ci
npm run dev
```

Abrir <http://localhost:5174/visor>. Funciona sin backend, PostgreSQL ni acceso a servicios externos. La descarga de Pannellum ocurre durante la instalación npm; en ejecución el visor y los panoramas se sirven desde el proyecto. La raíz ahora contiene el panel de Fase 3.

Se puede navegar con los botones de ambientes o las flechas dentro del panorama. Los botones `i` muestran información. Arrastrar gira, +/− cambia zoom y «Vista inicial» restaura orientación. «Medir coordenadas» habilita clic/tap para obtener yaw/pitch en grados; un arrastre o gesto multitáctil no selecciona punto. «Mostrar punto» agrega un hotspot temporal; «Quitar punto» lo elimina. Los marcadores se descartan al cambiar escena y no se guardan.

«Resolución de prueba» permite elegir automática o 2048×1024. «Desmontar visor» permite comprobar el ciclo de limpieza y remontaje. Los datos técnicos están agrupados en «Datos de esta prueba», fuera del flujo de navegación.

## Panoramas y permisos

Las cuatro imágenes PNG de `frontend/public/panoramas/` fueron creadas en este repositorio mediante `frontend/scripts/generate_panorama_fixtures.py`, usando sólo la biblioteca estándar de Python. Son grillas originales, sin fotografías ni contenido de terceros. No hay descarga ni dependencia de un proveedor externo de imágenes.

Dos ambientes con dos tamaños cada uno:

| Ambiente | 4096×2048 | 2048×1024 |
| --- | --- | --- |
| Atrio | 62.042 bytes | 22.538 bytes |
| Sala | 62.053 bytes | 22.542 bytes |

Grilla equirectangular completa 2:1 con divisiones cada 30°; diferencia de color permite identificar cambio de escena. Regenerar desde `frontend` con `python3 scripts/generate_panorama_fixtures.py`.

Son fixtures de integración, no fotos inmobiliarias. PNG facilita generación reproducible sin agregar un codificador JPEG; no cambia la decisión del MVP de aceptar uploads JPEG. La calidad de fotografías, artefactos de costura, legibilidad y transferencia real deben medirse luego con panoramas propios o autorizados de cámara 360.

Pannellum está fijado en 2.5.7, con las correcciones de seguridad consideradas en el plan. El aviso MIT se conserva en `frontend/public/PANNELLUM-LICENSE.txt`, incluido en el build. [Release oficial](https://github.com/mpetroff/pannellum/releases/tag/2.5.7).

## Adaptador y ciclo de vida

- `viewer/types.ts`: contrato propio de escenas, fuentes, hotspots y coordenadas. No contiene modelos SQLAlchemy ni configuración del visor.
- `viewer/pannellumAdapter.ts`: integración imperativa aislada; carga, orientación, zoom, conversión de coordenadas, hotspots, resize y destrucción.
- `viewer/PanoramaViewer.tsx`: contenedor React, estados de carga/error, controles y callbacks.
- `viewer/demoScenes.ts`: dos escenas exclusivamente en memoria, con una arista en cada dirección e información textual.

El adaptador se crea al montar el componente. Cada cambio de escena cancela el fetch anterior, destruye el renderer anterior y crea uno para la imagen activa; no mantiene todas las texturas ni precarga el ambiente siguiente. Esta simplificación evita retener escenas completas durante esta prueba. No hay transiciones con imágenes duplicadas ni caché de panoramas en memoria de la app; el caché HTTP puede reutilizar archivos al volver.

Se valida la proporción 2:1 y las dimensiones declaradas después de decodificar. Esto verifica fixtures de confianza, no reemplaza la validación de uploads del futuro backend.

Decisión específica de integración: el código de Pannellum 2.5.7 descarga imágenes mediante un XHR interno no expuesto para cancelación. El adaptador usa fetch con AbortController, decodifica antes de inicializar el renderer y pasa el HTMLImageElement como fuente `dynamic`. `dynamicUpdate` se desactiva en el evento de carga para evitar un bucle de actualización permanente. Se revoca la URL blob temporal y se ignoran resultados de descargas obsoletas.

**Límite de rendimiento a evaluar:** una fuente `dynamic` todavía puede volver a subir la textura al dibujar durante interacción. Desactivar `dynamicUpdate` no la convierte en textura estática. Antes de llevar esta estrategia al MVP, medir fluidez/consumo con fotos reales y comparar con el cargador estático de la librería o una adaptación mínima mantenible. No se ha demostrado rendimiento de producción con estas grillas.

ResizeObserver redimensiona el canvas al cambiar el contenedor. Al desmontar se aborta la descarga, desconecta el observer, retiran callbacks/pointer listeners y destruye Pannellum, que libera su contexto WebGL. React StrictMode permanece activo y las pruebas corren contra el servidor de desarrollo para ejercitar su ciclo adicional de montaje/limpieza.

Hotspots con botones accesibles y textos mediante `textContent`; no se inyecta HTML del contenido. Navegación se comunica mediante callback a React; información usa un bloque React. Sólo se traducen datos propios a opciones del visor. [API oficial](https://pannellum.org/documentation/api/), [referencia de configuración](https://pannellum.org/documentation/reference/).

## Tamaños y memoria

El adaptador consulta `MAX_TEXTURE_SIZE` antes de descargar y escoge la fuente de mayor tamaño compatible, con máximo 4096 para esta prueba. Si el límite no permite 4096, usa 2048. Si ninguna variante es compatible, muestra un error. El contexto usado para consultar el límite se libera inmediatamente.

| Fuente | Píxeles | Buffer RGBA estimado |
| --- | --- | --- |
| 4096×2048 | 8.388.608 | 32 MiB |
| 2048×1024 | 2.097.152 | 8 MiB |

Esto es una estimación de un buffer decodificado, no medición de memoria total: se suman textura GPU, canvas, navegador y posibles copias temporales. El límite de textura indica compatibilidad dimensional, no memoria disponible ni fluidez. La elección manual menor permite comparar en móviles que aceptan 4096 pero tienen recursos limitados.

La UI mide tiempo de fetch + decode + inicialización y bytes de archivo descargado. Las grillas comprimidas pesan alrededor de 22–61 KiB, por lo que esos tiempos no sirven para estimar transferencia de JPEG fotográficos grandes. No se fija todavía un SLA de carga ni FPS objetivo.

## Prueba real de CORS local

Un servidor Node pequeño, exclusivo de desarrollo/pruebas, sirve únicamente estas fixtures. No es un endpoint de FastAPI, storage de producto ni proxy de imágenes.

En una terminal, desde `frontend`:

```sh
npm run demo:media
```

En otra, también desde `frontend`:

```sh
VITE_DEMO_MEDIA_BASE_URL=http://127.0.0.1:5175 npm run dev
```

El frontend de 5174 obtiene imágenes desde 5175 con CORS permitido. El servidor sólo escucha en 127.0.0.1. Para verificar rechazo, usar como base `http://127.0.0.1:5175/no-cors`: devuelve las mismas imágenes sin Access-Control-Allow-Origin y el navegador bloquea la carga. Reiniciar Vite al cambiar el entorno; no reemplazar el `.env` privado.

Las descargas no llevan credenciales. `Access-Control-Allow-Origin: *` en el servidor de fixtures se aplica sólo a estas imágenes públicas de prueba; no modifica la política CORS del backend ni define la del storage privado futuro.

## Pruebas automatizadas

Playwright es dependencia de desarrollo, no forma parte del bundle. Su configuración levanta servidores aislados en 5175 (medios) y 5176 (Vite), y los detiene al terminar. Esos puertos deben estar libres; no reutiliza servidores ajenos.

Instalación y ejecución habitual:

```sh
cd frontend
npx playwright install chromium
npm run test:e2e
npm run build
```

WebKit se instala y habilita explícitamente en un sistema operativo compatible con su distribución vigente:

```sh
npx playwright install webkit
TEST_WEBKIT=1 npm run test:e2e
```

En este equipo se usó Chrome ya instalado:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

También se intentó WebKit con `TEST_WEBKIT=1` y `PLAYWRIGHT_BROWSERS_PATH=/private/tmp/vista360-playwright`. La descarga se completó, pero el navegador congelado para macOS 14 no pudo crear una página: `Protocol error (Page.overrideSetting): Unknown setting: PushAPIEnabled`. El fallo ocurre en el fixture del navegador antes de ejecutar la app. Esos casos **no cuentan como aprobados**; Safari/WebKit permanece pendiente. No se parcheó la herramienta ni se cambió a dependencias antiguas para ocultar esa incompatibilidad.

Cobertura: navegación por hotspots, información, carga sólo de escena activa desde otro origen, coordenadas centro/zoom, clic/tap frente a arrastre, agregado/eliminación de marcador, resize, descarga cancelada, navegación rápida, desmontaje repetido, retiro de listeners globales, liberación de contextos WebGL, fallback de textura, resolución manual, ausencia de WebGL y rechazo CORS con recuperación. Swipe y pinch mediante CDP se ejecutan sólo en Chromium móvil emulado; ese caso se omite deliberadamente en los otros tres proyectos.

Resultado local del 13/10/2026: TypeScript estricto (incluye tests/configuración) y build Vite aprobados. Suite final de Chrome: **19 aprobadas, 1 omitida intencionalmente**, sin fallos. El gesto CDP se omite en desktop; se ejecuta en el proyecto móvil. Los intentos WebKit fallidos corresponden a infraestructura y quedan registrados aparte, no se consideran aprobados.

También se comprobó el build de producción mediante `vite preview` y Chrome: panorama inicial, canvas único y navegación ida/vuelta sin errores JavaScript. Los servidores de verificación quedaron detenidos.

Capturas y traces quedan en `frontend/test-results/`, excluido de Git. Las capturas desktop y móvil fueron inspeccionadas para comprobar tamaño de controles y ausencia de desbordamiento.

El motor WebKit disponible para este macOS es una distribución congelada de Playwright (build 2251) incompatible con la creación de páginas de este runner; no se ha validado Safari. Chromium usa WebGL por software en estas pruebas. Son verificaciones locales de integración, no certificaciones de dispositivos físicos ni pruebas de GPU móvil.

## Validación física pendiente

Para acceder desde un teléfono de la misma red, usar imágenes del mismo origen (base de medios vacía) e iniciar Vite con `npm run dev -- --host 0.0.0.0`. Abrir `http://IP_LOCAL_DEL_EQUIPO:5174/visor` en el teléfono. El servidor de desarrollo se expone temporalmente a la red local; detenerlo al terminar. No necesita sensores ni HTTPS para esta prueba de interacción manual.

Registrar modelo de dispositivo, versión OS/navegador, resolución seleccionada, límite de textura, tiempo indicado y síntomas:

| Comprobación | Safari iPhone real | Chrome Android real |
| --- | --- | --- |
| Cargar ambas escenas sin errores | Pendiente | Pendiente |
| Giro táctil y pinch fluidos | Pendiente | Pendiente |
| Hotspots y lista de ambientes | Pendiente | Pendiente |
| Tap de coordenadas frente a arrastre | Pendiente | Pendiente |
| Cambiar orientación del teléfono | Pendiente | Pendiente |
| Comparar 4096 y 2048, observar memoria/recargas | Pendiente | Pendiente |
| Cambiar de escena repetidamente, desmontar/remontar | Pendiente | Pendiente |

También queda pendiente repetir las mediciones con fotografías equirectangulares autorizadas antes de afirmar que la entrega 4096×2048 sirve como valor por defecto del MVP. Estos pendientes no bloquean el desarrollo local de la Fase 3, aprobado por el usuario; se mantienen como requisitos antes de validar el visor para producción.
