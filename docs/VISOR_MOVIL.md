# Mirar moviendo el celular

El visor compartido agrega control opcional mediante los sensores de orientación del dispositivo. Está disponible en recorridos públicos, previsualizaciones, editor y prueba `/visor`, usando el mismo componente.

## Uso

1. Abrir el recorrido desde un enlace HTTPS en un celular compatible.
   En el recorrido publicado, los controles aparecen arriba de la panorámica,
   dentro de la pantalla. Para bajar al resto de la página, deslizar desde esa
   barra; arrastrar sobre la foto sirve para mirar alrededor.
   Las conexiones muestran un doble chevrón sobre un aro y el nombre del destino.
   Se puede tocar tanto el marcador como su etiqueta para cambiar de ambiente.
   Al cambiar de ambiente se conserva el visor, su canvas y los controles. La
   imagen anterior permanece durante la descarga y se funde con la siguiente;
   con movimiento reducido el cambio no usa animación. El editor conserva el
   visor también mientras consulta la foto y las conexiones del siguiente espacio.
2. Esperar a que cargue la panorámica y pulsar **Mirar con el celular**.
3. Si el navegador pide permiso de movimiento, permitirlo. No se pide acceso a la cámara.
4. Apuntar el teléfono hacia adelante y moverlo suavemente. La primera lectura conserva el encuadre actual; las siguientes acompañan el giro y la inclinación.
5. **Centrar movimiento** toma nuevamente la posición del teléfono como referencia, manteniendo el encuadre.
6. **Desactivar movimiento** o arrastrar la imagen vuelve al control manual. Vista inicial y las herramientas para ubicar puntos también detienen el seguimiento.

El zoom sigue siendo independiente. El horizonte se mantiene nivelado; la inclinación se limita a ±85 grados. Girar el teléfono no cambia de ambiente ni genera movimiento físico continuo dentro de las fotos.

## Disponibilidad y permisos

### Prueba del recorrido público en el mismo Wi-Fi

Con el backend iniciado en el puerto 8001, ejecutar desde `frontend`:

```sh
VITE_API_BASE_URL=/ npm run dev -- --host 0.0.0.0 --port 5177
```

En el celular conectado al mismo Wi-Fi, abrir el enlace publicado reemplazando
`http://localhost:5174` (o `http://127.0.0.1:5174`) por
`http://IP_LOCAL_DE_LA_COMPUTADORA:5177`, conservando `/tour/...` completo.
El proxy de Vite entrega únicamente las rutas públicas `/api/v1/public/tours/`
y `/api/v1/public/media/` desde el mismo origen, sin exponer
el puerto del backend a la red. Esta prueba es para los recorridos públicos;
no agrega el origen de red a los permitidos para operaciones autenticadas.
Mantener la computadora encendida y el proceso activo. Detener con `Ctrl+C`.
Por HTTP se puede explorar con el dedo; los sensores requieren HTTPS.

### Sensores

Los controles se muestran en dispositivos táctiles o con puntero principal grueso. La presencia de la API no garantiza un sensor físico: si no llegan datos válidos se muestra un aviso después de seis segundos. Los permisos rechazados, errores del navegador y la ausencia de la API conservan el control manual.

Los sensores requieren un contexto seguro. HTTPS es necesario para acceder desde el celular a una dirección remota; abrir la IP de la computadora mediante HTTP puede bloquearlos. Los navegadores suelen considerar localhost/loopback seguro para desarrollo, pero esa dirección corresponde al dispositivo desde el cual se abre. La solicitud de permiso se ejecuta directamente desde el click, como exigen los navegadores que implementan requestPermission.

Referencias: [DeviceOrientationEvent y permisos](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), [coordenadas y rotaciones Z-X-Y del estándar](https://www.w3.org/TR/orientation-event/#deviceorientation).

## Implementación

`deviceOrientation.ts` convierte las rotaciones del dispositivo en la dirección de su cámara trasera, con una referencia relativa al encuadre del recorrido. Este cálculo sirve en posición vertical u horizontal, usa el camino angular corto al cruzar 0/360 grados y suaviza la vista con requestAnimationFrame. En las cercanías de los polos mantiene la última dirección horizontal para evitar saltos por una dirección indeterminada.

Se usa la API de orientación del navegador y el adaptador existente para aplicar yaw/pitch. No se agrega una biblioteca ni se activa la orientación nativa de Pannellum, que en esta versión limita su detección por protocolo y user-agent y maneja el permiso internamente. La solicitud de permisos y sus errores quedan controlados por la aplicación, sin modificar la dependencia instalada.

El seguimiento se pausa durante las descargas y las transiciones y se recalibra en la vista inicial del ambiente nuevo. Se liberan listeners, temporizadores y animaciones al detenerlo, desmontar o esconder la pestaña. Si un permiso se resuelve después del desmontaje no se reactivan sensores. No se guardan ni se envían lecturas al backend; el control arranca apagado y requiere activación explícita.

## Validación

TypeScript y compilación de producción aprobados. Los 16 casos de orientación en escritorio y móvil pasaron por grupos con sensores simulados: activación explícita, giro/inclinación, zoom independiente, posición horizontal, cruce de cero, centrado, retorno manual, cambio real de ambiente, limpieza, permisos denegados/rechazados/tardíos, falta de lecturas, ausencia de API, HTTPS y pestaña oculta.

También pasaron los 14 casos seleccionados del visor existente en escritorio y móvil (36,6 s): carga entre orígenes, hotspots, navegación rápida, WebGL, CORS, transiciones y movimiento reducido. No hubo cambios de backend, base de datos ni dependencias.

La prueba física en Android/Poco X6 Pro y Safari/iPhone queda pendiente: la emulación comprueba el software, no la precisión y sensibilidad del sensor real ni los diálogos del sistema operativo.

## Optimización del rendimiento

El visor compartido por el editor, el recorrido público y la inserción iframe usa estas reglas:

- En dispositivos táctiles o con puntero grueso, comienza en «Fluida (recomendada)»: elige la mayor variante compatible de hasta 2048 px de ancho. Si sólo hay variantes mayores, utiliza la menor compatible disponible. No descarga variantes de ambientes inactivos.
- «Alta calidad» permite usar la mayor variante que admita la GPU. La selección se conserva al cambiar de ambiente mientras el visor está abierto; abrir nuevamente el recorrido vuelve al valor recomendado. En escritorio se conserva la selección automática de mayor resolución compatible.
- Cambiar la calidad conserva dirección y zoom, reutiliza el canvas y pausa/reanuda los sensores durante la carga. No cambia los originales ni las versiones guardadas o publicadas.
- Las fotos se presentan como imágenes estáticas en Pannellum: se carga la textura al abrir el ambiente, sin volver a subir todos los píxeles a la GPU en cada frame de movimiento. La URL temporal permanece disponible hasta que termina la carga nativa y se libera después.
- El filtro del sensor mantiene suavizado, con constante de tiempo de 30 ms en lugar de 65 ms. Continúan los permisos explícitos, centrado, límites de inclinación, continuidad entre ambientes y limpieza al ocultar/desmontar el visor.

Una variante 2048×1024 requiere aproximadamente 8 MiB por buffer RGBA frente a 32 MiB para 4096×2048. Esto no equivale al uso total de memoria ni garantiza un número de FPS. La fluidez final depende del teléfono, navegador, resolución de pantalla y temperatura.

### Comparación manual

Después del despliegue, abrir el enlace público en el teléfono, recargar y recorrer varios ambientes usando arrastre y «Mirar con el celular». Comparar «Fluida» con «Alta calidad», incluyendo cambios de ambiente, inclinación y vuelta al visor tras ocultar la pestaña. Comprobar que las flechas y el zoom siguen respondiendo. Las pruebas automatizadas emulan un celular; no reemplazan esta prueba física.

### Verificación de la optimización

Compilación de producción, TypeScript y catálogo español/portugués verificados. Pasaron 51 casos de visor, orientación e iframe entre Chrome de escritorio y emulación móvil; el caso de gesto táctil se omite en escritorio. Se comprobó con instrumentación de WebGL que mover y acercar la vista no vuelve a ejecutar `texImage2D`, además de la descarga de la variante adecuada, cambio de calidad conservando encuadre/canvas, continuidad de sensores y respuesta del filtro con reloj controlado. También pasó el flujo de trabajo completo con API, PostgreSQL y worker reales en un entorno de prueba aislado, en ambas variantes de navegador: fotos, conexiones, publicación y entrega. Los controles se compactaron para conservar el tamaño inmersivo de la panorámica en vertical y horizontal. Continúa pendiente la comparación en un teléfono físico.
