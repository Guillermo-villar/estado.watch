# estado.watch

Página independiente de disponibilidad de servicios públicos españoles. Cada web tiene una fila con su logo y dominio. Pulsa la flecha para desplegar sus servicios, consultar su historial y ver qué URL y contenido comprueba la sonda. El historial empieza al arrancar la instancia por primera vez.

## Ejecutar

Necesitas Node.js 24 o posterior. Desde este directorio, ejecuta `npm start` y abre <http://127.0.0.1:3000>. El proyecto usa la biblioteca estándar de Node.js, incluido SQLite. Ejecuta `npm test` para probar la clasificación de respuestas.

Para alojarlo en un servidor, mantén una instancia de `npm start` en ejecución. Configura `HOST=0.0.0.0` para escuchar en todas las interfaces y `PORT` para elegir el puerto. Monta un directorio persistente en `DATA_DIR` (por defecto, `./data`). Sirve el proceso detrás de un proxy HTTPS para publicarlo.

## Desplegar en Cloudflare

La versión local ejecuta la web, la API y el temporizador en un proceso Node.js. En Cloudflare, un Worker sirve la API y los archivos estáticos. Un Cron Trigger ejecuta las mismas sondas cada cinco minutos UTC aunque nadie visite la página. D1 conserva por recurso los totales diarios de cada estado y la última medición de cada día. El navegador recibe los totales y la última medición desde `/api/status`. Las fechas del histórico se agrupan según Europe/Madrid. El despliegue empieza a medir desde su primera ronda.

Con Node.js 24 o posterior, desde la raíz del proyecto:

```sh
npm ci
npx wrangler login
npx wrangler d1 create estado-status --location weur
```

Copia el UUID que imprime el último comando a un campo `"database_id"` dentro de la entrada `DB` existente en [wrangler.jsonc](wrangler.jsonc). Si Wrangler ofrece añadir otro binding automáticamente, conserva la entrada existente. A continuación ejecuta:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Wrangler imprime la URL de la web. El cron queda configurado en el mismo despliegue. Hasta la primera ejecución, el panel muestra el histórico vacío. Para probar el mismo entorno en tu ordenador:

```sh
npx wrangler d1 migrations apply DB --local
npx wrangler dev --local --test-scheduled
```

Con el emulador en marcha, `curl http://localhost:8787/__scheduled` ejecuta una ronda y `curl http://localhost:8787/api/status` devuelve las mediciones. La base emulada se guarda en `.wrangler/state/`. [Guía D1](https://developers.cloudflare.com/d1/get-started/) · [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

## Qué se mide

La sonda hace un GET por recurso al arrancar y repite cinco minutos después de terminar cada ronda. Sigue redirecciones, espera hasta 15 segundos y busca el marcador configurado en los primeros 256 KiB de la respuesta. En ficheros binarios con `markerType: "hex-prefix"`, solicita únicamente el rango inicial y compara esos bytes con la firma hexadecimal configurada. El tiempo mostrado incluye la lectura del contenido comprobado. Si el resultado es una caída, la sonda repite la petición una vez cinco segundos después y guarda el resultado del reintento.

- **Disponible** indica una respuesta 2xx con el marcador esperado.
- **Caída observada** indica un error 5xx, de conexión o de tiempo de espera desde esta instancia. Una avería en la red de la sonda también puede producir ese resultado.
- **Inconcluyente** incluye los fallos de resolución DNS desde la sonda, otro código HTTP o contenido inesperado, por ejemplo una página de bloqueo.

El histórico conserva treinta días. La disponibilidad expresa la proporción de muestras disponibles entre las concluyentes. Los periodos sin mediciones quedan sin cobertura. Comprobar una portada o una consulta pública solo cubre ese recurso concreto.

El uptime acumulado cuenta las comprobaciones operativas y las divide entre las operativas y las fallidas. Cada recurso cuenta desde su primera medición conservada. Los totales de cada URL persisten al reiniciar el monitor y al caducar los detalles del histórico de treinta días. Al actualizar una instalación, SQLite y D1 inicializan esos contadores a partir de los datos que conserve esa instancia.

## Datos y contribuciones

`GET /api/status` devuelve el catálogo, la hora de generación UTC, la cadencia y las muestras ordenadas por fecha. El navegador consume esta misma respuesta. Para proponer un servicio, añade a [services.json](services.json) su `siteId`, un identificador estable, nombre, categoría, URL pública y marcador de contenido distintivo. Para incorporar otra web, registra su nombre, dominio y ruta del logo en [sites.json](sites.json) y añade su icono PNG en `assets/logos/`. Documenta en [FUENTES.md](FUENTES.md) qué operación cubre y cómo reproducirla.

## Antecedentes

[¿Está caída la sede?](https://estado-sede.org/) reúne sedes de la administración española. [¿Cuántos nueves tiene Renfe?](https://renfe.borjagm1.com/) presenta histórico y latencia por servicio. Las [páginas de estado de UptimeRobot](https://uptimerobot.com/status-page/) son otra referencia para el panel, y la [biblioteca MCP de Reforma Digital](https://reforma-digital.es/developers/mcp) reúne conectores para consultar datos públicos españoles.

Licencia [MIT](LICENSE).
