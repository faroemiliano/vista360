# Interfaz guiada con Tailwind

Clientes es ahora una cartera de organizaciones y particulares, sin formulario de alta independiente. La navegación y operación actuales se describen en [UX.md](UX.md): Organizaciones y Particulares en el sidebar y un trabajo guiado en seis pasos. Las verificaciones de entregas anteriores se conservan debajo como antecedentes.

La interfaz organiza el trabajo en cuatro pasos: crear un recorrido, cargar fotos por ambiente, conectar espacios y publicar. La renovación es de frontend; conserva las APIs, archivos y datos existentes.

## Pantallas

- Acceso: formulario de ingreso/registro, explicación del producto y guía inicial. En celular el formulario aparece primero.
- Colección: tarjetas con título, descripción y estado real; creación del recorrido en un panel independiente y mensajes de confirmación.
- Recorrido: resumen de ambientes/fotos, guía compacta, datos editables desplegables, lista de ambientes y formulario de creación. Cada ambiente muestra su estado de carga y explica cuándo se habilita Conectar.
- Editor: visor y panel de instrucciones o formulario de punto. Tipo, etiqueta y destino/texto primero; coordenadas manuales dentro de opciones desplegables. La vista inicial también puede guardarse directamente desde la foto.
- Publicación: sección final del flujo, con cambios pendientes, enlace, acciones de publicación y explicación del alcance local del enlace.
- Visitante: vista pública con identidad visual de Vista360 e instrucciones para mirar, avanzar y elegir ambientes.

El visor comparte controles visibles **Acercar**, **Alejar**, **Vista amplia** y **Vista inicial**. Por preferencia del usuario, cada ambiente abre con campo horizontal de 110°, el máximo alejamiento permitido, tanto en edición como en preview y recorrido público. Vista inicial restaura la dirección guardada con ese mismo alejamiento; Vista amplia conserva la dirección actual y vuelve a 110°. El usuario puede acercarse durante la visita. Las fotos y los datos guardados no se modifican: se respeta yaw/pitch inicial y se aplica esta preferencia de apertura sobre el zoom previamente almacenado. La dirección elegida se sigue pudiendo guardar mediante Guardar vista actual como inicial y publicar cambios.

## Diseño e implementación

Tailwind CSS 4.3.3 y su plugin oficial @tailwindcss/vite 4.3.3, fijados en package.json y package-lock.json. Configuración según la [documentación oficial para Vite](https://tailwindcss.com/docs/installation/using-vite). Los estilos se compilan localmente; no se usa un CDN de estilos.

Identidad de estudio fotográfico con fondos azul noche, superficies oscuras, acento cian y detalles violeta. Tokens Tailwind compartidos (`canvas`, `surface-*`, `ink`, `muted`, `accent`, `violet`, `line`) para mantener consistencia entre landing, acceso, trabajos, organizaciones, clientes, propiedades, editor y recorrido público. Tipografía del sistema; sin fuentes ni estilos descargados de servicios externos.

`BrandMark.tsx` aporta la marca vectorial inspirada en un diafragma. `CaptureVisual.tsx` contiene la ilustración óptica de la landing y las cubiertas gráficas de la colección. No son fotografías ni trabajos reales: no se inventaron propiedades o testimonios y no se descargan panorámicas privadas para decorar. Iconos SVG locales de cámara, enfoque y diafragma; favicon coherente y metadatos de tema oscuro.

Landing con hero de óptica, titulares con acentos de color, tarjetas de soluciones, proceso de captura y formulario real. Panel con menú activo cian, cabecera translúcida, estados y formularios oscuros. Inputs nativos con `color-scheme: dark`, controles primarios cian con texto oscuro y foco visible. Se respeta la preferencia de movimiento reducido. Las reglas específicas de WebGL conservan medidas estables para no alterar coordenadas, giro, zoom o transiciones; el ajuste de controles nativos de Pannellum no filtra ni modifica las fotografías.

La colección muestra una representación gráfica del recorrido; no descarga todas las panorámicas para decorar las tarjetas. La generación de miniaturas sigue siendo una mejora futura del plan. El visor continúa cargando la escena activa.

Las etiquetas visibles evitan exigir vocabulario técnico: Dirección del enlace en lugar de slug, vista inicial opcional, estados de carga en lenguaje natural. Los nombres accesibles que consumen las pruebas existentes se conservan. Hay controles táctiles de al menos 44 px, foco visible y layouts para móvil, tablet y escritorio.

## Ejecutar

Desde frontend, con Node compatible seleccionado:

```sh
npm ci
npm run dev
```

Abrir http://localhost:5174. Tras cambiar la configuración de Vite o instalar dependencias, reiniciar ese proceso. Build: `npm run build`.

Para la prueba completa, desde backend con PostgreSQL local activo y entorno virtual instalado:

```sh
RUN_BROWSER_TESTS=1 PLAYWRIGHT_CHANNEL=chrome .venv/bin/python -m pytest -xq --tb=short tests/test_browser.py
```

Usa una base y directorio temporales. Comprueba acceso, CRUD, fotos, orientación, puntos, recorrido público, publicación/republicación/despublicación y transiciones en Chrome escritorio y móvil emulado. La revisión visual adicional usa pantallas de acceso reales y datos interceptados para la colección, sin crear cuentas de ejemplo en la base de desarrollo. Safari y teléfonos físicos siguen pendientes de las fases anteriores.

Resultado local: instalación reproducible con npm ci, TypeScript y build aprobados. Runner completo con 29 casos frontend aprobados y una omisión intencional de CDP. Acceso, colección y detalle inspeccionados en escritorio y móvil; las mediciones de ancho incluyeron 1440, 412/393 y 320 px, sin desbordamiento en las pantallas revisadas. El servidor de desarrollo se reinició con el plugin instalado y quedó activo en 5174. Sin migraciones ni cambios de backend en esta renovación.

La verificación anterior corresponde a la primera interfaz guiada. En la renovación visual de octubre de 2026 pasaron TypeScript y build y el runner completo de navegador: 35 casos correctos y una omisión intencional de CDP en desktop, ejecutados dentro de un test pytest correcto (157,96 s). Incluye trabajos, solicitudes, editor, media, publicación y visitante anónimo. Se revisaron landing y acceso a 1440, 393 y 320 px sin desbordamiento, además de fichas y editor en escritorio/móvil. Los archivos de pruebas y base temporal están separados de los datos reales. No se agregaron dependencias ni se cambiaron APIs, permisos, publicación o almacenamiento para aplicar esta estética. Safari y dispositivos físicos siguen pendientes; no hay script de lint configurado.

## Navegación centralizada y eliminación de clientes

El sidebar es el único menú de secciones; se retiraron las pestañas duplicadas de organización, trabajos y la fila horizontal móvil. En teléfonos, Menú abre y cierra esa misma navegación. Mis recorridos contiene los proyectos personales y Recorridos abre los de la organización activa. Se mantienen los botones contextuales para abrir un registro o volver desde su detalle. Solicitudes Studio conserva la preparación de trabajos y el acceso al trabajo resultante.

Las tarjetas de Clientes incorporan Eliminar con confirmación. Con la actualización `0009_deletions`, los clientes con propiedades o trabajos se retiran de la agenda y conservan sus referencias históricas; los permisos y la protección de sesión/CSRF también se verifican en backend. Cancelar conserva el registro y eliminar el cliente que se estaba editando restablece el formulario. No se agregan dependencias. La migración 0009 permite conservar el historial al eliminar clientes y organizaciones.

Validación de esta entrega: TypeScript/build correctos; 14 pruebas de backend de negocio y trabajos aprobadas. Los 8 casos específicos de navegador (clientes/navegación, cartera/permisos, solicitudes y entrega, en Chrome escritorio y móvil emulado) pasaron mediante el runner con PostgreSQL y almacenamiento temporales (61,35 s). Se corrigió la sincronización del helper de navegación con el login y la apertura del menú móvil. La suite general no quedó aprobada: mostró fallos de coordenadas y sincronización de transiciones en pruebas del visor y superó el límite de 240 s; no se modificó el visor como parte de esta entrega. No se eliminaron clientes reales.

La actualización del flujo guiado está documentada en [UX.md](UX.md). TypeScript/build y los 12 casos del panel en escritorio/móvil pasaron con PostgreSQL y medios temporales (150,48 s). Se conservaron los datos de desarrollo y las dependencias existentes.
