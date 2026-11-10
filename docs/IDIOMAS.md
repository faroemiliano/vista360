# Español y portugués de Brasil

La interfaz de Vision360 tiene un selector **Idioma**, con Español y Português (Brasil). Aparece en el inicio, el estudio, formularios públicos, páginas de seguridad y recorrido/visor. Español sigue siendo el idioma predeterminado.

La preferencia se guarda en `localStorage` con la clave `vision360-language` y se conserva al navegar, recargar, ingresar y cerrar sesión en ese navegador. Se sincroniza entre pestañas del mismo origen. No es una configuración de servidor ni se sincroniza entre dispositivos. Si el almacenamiento está bloqueado, el selector sigue funcionando durante la página abierta.

Cambiar el idioma no recarga la página, no remonta la aplicación ni descarta formularios. React conserva el estado y el visor existente. Se actualiza `html.lang`, los nombres accesibles de los controles, los textos y las fechas según `es-AR` o `pt-BR`. Se conservan rutas, slugs y enlaces compartidos.

## Alcance

Se traducen navegación, formularios, etiquetas, botones, planes, administración, pasos del trabajo, publicación, mensajes habituales de validación/error, avisos y controles del visor. Los nombres de estados se traducen para mostrar, conservando los códigos originales de la API. Los mensajes conocidos del backend se presentan en el idioma elegido en el frontend; no se modifican validaciones, sesiones, permisos ni reglas comerciales.

Los nombres y textos escritos por clientes o fotógrafos no se traducen: cuentas, estudios, organizaciones, direcciones, títulos/descripciones de recorridos, nombres de ambientes, puntos informativos y notas conservan lo que escribió su autor. La demo sintética sí localiza sus textos propios. Las traducciones no usan servicios externos ni envían contenido a terceros.

Los emails del worker y los documentos externos siguen usando sus plantillas actuales; el selector corresponde a la interfaz web. Los diálogos y mensajes nativos del navegador pueden usar el idioma del navegador o sistema operativo.

## Implementación y mantenimiento

- `frontend/src/i18n/index.ts`: idioma, almacenamiento, suscripciones de React, traducción e interpolación segura de parámetros.
- `frontend/src/i18n/pt-BR.json`: catálogo español → portugués, cargado aparte sólo cuando se necesita portugués.
- `frontend/src/i18n/LanguageSwitcher.tsx`: selector reutilizado en los encabezados.
- `t('Texto del sistema')` y `t('Texto con {0}', [dato])`: envolver textos de interfaz; nunca aplicar genéricamente a contenido de usuarios.
- `dateLocale()`: formato de fechas según el idioma elegido.

Los valores interpolados se conservan como datos; no se insertan mediante HTML. El catálogo permite mostrar mensajes del sistema ya guardados en un estado de React al cambiar de idioma. Los códigos internos de estados, rutas, IDs y payloads de la API se mantienen estables.

El inicio se carga en un módulo separado para mantener liviano el paquete del estudio. No se agregaron dependencias, migraciones ni configuración de Render.

`npm --prefix frontend run check:i18n` comprueba que las traducciones referenciadas existan, que no estén vacías y que mantengan los parámetros de interpolación. También se ejecuta en cada `npm run build`.

## Verificación

Playwright comprueba escritorio y celular: inicio y planes, registro en portugués, cuenta y clientes con API real, persistencia y sincronización entre pestañas, conservación de una ficha sin guardar, errores de login, formularios públicos, páginas de seguridad y cambio de idioma en un tour sin reemplazar su canvas ni traducir el contenido del cliente. Los flujos existentes en español se verifican aparte.
