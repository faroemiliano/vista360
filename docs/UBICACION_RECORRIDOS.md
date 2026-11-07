# Ubicación pública y cómo llegar

Cada recorrido puede incluir una ubicación pública opcional. No se copia la dirección interna de la propiedad ni del cliente.

1. Abrir el trabajo, ir al paso **5 Revisar** y desplegar **Datos del recorrido**.
2. En **Ubicación para visitantes**, activar **Mostrar cómo llegar en el recorrido público**.
3. Escribir el nombre o dirección que se mostrará y completar latitud y longitud del acceso exacto. Se aceptan valores negativos y decimales; latitud entre -90 y 90, longitud entre -180 y 180.
4. Usar **Comprobar destino en Google Maps** antes de guardar.
5. Pulsar **Guardar información** y luego **Publicar recorrido** o **Publicar cambios**.

El visitante verá **Cómo llegar** junto al título. Abre Google Maps en una pestaña o aplicación externa, con las coordenadas como destino y sin fijar el origen. Maps puede usar la ubicación actual si está disponible y autorizada, o pedir un punto de partida. La selección de transporte, las alternativas, el tráfico y las indicaciones se gestionan en Google Maps. Vision360 no calcula tiempos ni garantiza una ruta más rápida.

La integración utiliza [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), sin claves, SDK ni servicios de rutas pagos. Vision360 no solicita ni almacena la ubicación del visitante.

Para quitar el botón, desactivar la opción, guardar y publicar los cambios. Editar el borrador conserva la ubicación anterior en la versión pública hasta volver a publicar. Los recorridos y publicaciones anteriores siguen funcionando sin ubicación.

La migración `0014_tour_public_location` añade un campo opcional sin modificar las ubicaciones privadas existentes. En desarrollo: `cd backend && .venv/bin/alembic upgrade head`. Render ejecuta las migraciones al iniciar.
