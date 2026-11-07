# Ubicación pública y cómo llegar

Cada recorrido puede incluir una ubicación pública opcional. No se copia la dirección interna de la propiedad ni del cliente.

1. Abrir el trabajo, ir al paso **5 Revisar** y desplegar **Datos del recorrido**.
2. En **Ubicación para visitantes**, activar **Mostrar cómo llegar en el recorrido público**.
3. En **Dirección o enlace de Google Maps**, escribir la dirección completa (calle, número, localidad) o pegar el enlace de **Compartir** de Maps. No hace falta cargar coordenadas.
4. Solo si se necesita precisar una entrada o un lugar difícil de encontrar, abrir **Precisar con coordenadas (opcional)** y completar ambas: latitud entre -90 y 90 y longitud entre -180 y 180. Las coordenadas tienen prioridad sobre la dirección o el enlace.
5. Usar **Comprobar destino en Google Maps** antes de guardar.
6. Pulsar **Guardar información** y luego **Publicar recorrido** o **Publicar cambios**.

El visitante verá **Cómo llegar** junto al título. Abre Google Maps en una pestaña o aplicación externa. Con una dirección o coordenadas solicita la ruta sin fijar el origen. Con un enlace compartido abre exactamente ese enlace, donde el visitante puede elegir **Cómo llegar**; los enlaces cortos no se resuelven ni se transforman desde Vision360. Solo se admiten enlaces HTTPS de Google Maps. Maps puede usar la ubicación actual si está disponible y autorizada, o pedir un punto de partida. La selección de transporte, las alternativas, el tráfico y las indicaciones se gestionan en Google Maps. Vision360 no calcula tiempos ni garantiza una ruta más rápida.

La integración utiliza [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), sin claves, SDK ni servicios de rutas pagos. Vision360 no solicita ni almacena la ubicación del visitante.

Para quitar el botón, desactivar la opción, guardar y publicar los cambios. Editar el borrador conserva la ubicación anterior en la versión pública hasta volver a publicar. Los recorridos y publicaciones anteriores siguen funcionando sin ubicación.

La migración `0014_tour_public_location` añade un campo opcional sin modificar las ubicaciones privadas existentes. En desarrollo: `cd backend && .venv/bin/alembic upgrade head`. Render ejecuta las migraciones al iniciar.
