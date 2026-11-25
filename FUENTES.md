# Fuentes de estado.watch

El catálogo agrupa 18 recursos de ocho sitios públicos españoles. Las portadas, las páginas informativas, los formularios de acceso, las APIs y el archivo de horarios admiten consultas HTTPS con `GET` anónimo. El resultado de cada comprobación se limita a la respuesta HTTP y al contenido esperado de la URL concreta, observados desde el lugar donde se ejecuta el monitor.

| Servicio | Qué comprueba | Documentación oficial |
| --- | --- | --- |
| Cl@ve · Portal | La portada pública devuelve un título que comienza con `Cl@ve`. | [Portal de Cl@ve](https://clave.gob.es/) |
| Cl@ve · Información de registro | La página informativa sobre el registro devuelve un título que comienza con `Cl@ve \| Registro`. | [Cómo registrarse en Cl@ve](https://clave.gob.es/registro/como-puedo-registrarme) |
| Mi Carpeta Ciudadana · Portal | La entrada pública devuelve el título `Carpeta Ciudadana`. | [Entrada de Mi Carpeta Ciudadana](https://carpetaciudadana.gob.es/) |
| Mi Carpeta Ciudadana · Más información | La página pública de información incluye `Mi Carpeta Ciudadana \| ¿Qué es Mi Carpeta Ciudadana?` en el título. | [Información de Mi Carpeta Ciudadana](https://masinformacioncarpeta.carpetaciudadana.gob.es/infocc/masInformacion/que-es-mi-carpeta-ciudadana) |
| BOE · API de sumarios | La API devuelve el campo `fecha_publicacion` al consultar el sumario histórico del 29 de mayo de 2024, el ejemplo de su documentación. Una fecha fija evita depender de la publicación del día. | [API de datos abiertos del BOE](https://www.boe.es/datosabiertos/api/api.php?lang=es), [documentación del sumario](https://www.boe.es/datosabiertos/documentos/APIsumarioBOE.pdf) |
| BOE · Portal | La portada devuelve un título que comienza con `BOE.es - Agencia Estatal`. | [Portal del BOE](https://www.boe.es/) |
| INE · API del IPC | La consulta de la tabla 50902 del IPC con `nult=1` devuelve el campo `FK_Unidad`. Se limita a un periodo por serie. | [Referencia de la API JSON del INE](https://www.ine.es/dyngs/DAB/es/index.htm?cid=1100) |
| INE · Portal | La portada devuelve un título que comienza con `INE. Instituto Nacional de Estadística`. | [Portal del INE](https://www.ine.es/) |
| Catastro · Callejero | El callejero público devuelve `consulta_provincieroResult` en su listado de provincias. | [Operaciones JSON del callejero](https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json/help) |
| Catastro · Portal | La portada devuelve un título que comienza con `Portal del Catastro`. | [Portal del Catastro](https://www.catastro.hacienda.gob.es/) |
| Cita Previa DNI · Portal | La portada incluye el enlace «Continuar» a las opciones de acceso. | [Portal de cita previa de la Policía Nacional](https://www.citapreviadnie.es/citaPreviaDni/Index.action) |
| Cita Previa DNI · Opciones de acceso | La página incluye el enlace «Acceso con datos DNI/NIE» al formulario. | [Opciones de acceso](https://www.citapreviadnie.es/citaPreviaDni/Inicio.action) |
| Cita Previa DNI · Formulario de acceso | El formulario público muestra el encabezado «Entrada al Sistema». | [Formulario DNI/NIE](https://www.citapreviadnie.es/citaPreviaDni/InicioDNINIE.action) |
| Renfe · Portal | La portada en español devuelve un título que comienza con `Renfe \| Billetes de tren`. | [Portal de Renfe](https://www.renfe.com/es/es) |
| Renfe · Trenes en tiempo real | La respuesta del visor de Alta Velocidad, Larga y Media Distancia contiene el campo `trenes`. | [Visor de largo recorrido](https://tiempo-real.largorecorrido.renfe.com/), [presentación oficial del visor](https://grupo.renfe.com/content/grupo-renfe/es/es/sala-de-prensa/noticias/2026/03/renfe-estrena-web-tiempo-real-trenes-alta-velocidad-larga-media-distancia) |
| Renfe · Horarios GTFS | La descarga de horarios comienza con los bytes `50 4B 03 04` de una cabecera ZIP. La sonda solicita esos cuatro bytes con `Range: bytes=0-3`. | [Ficha del recurso en Renfe Data](https://data.renfe.com/es/dataset/horarios-de-alta-velocidad-larga-distancia-y-media-distancia/resource/25d6b043-9e47-4f99-bd91-edd51d782450) |

## Verificación del catálogo

El 24 de noviembre de 2026 la sonda del monitor obtuvo HTTP 200 de las diez URLs de Cl@ve, Mi Carpeta Ciudadana, BOE, INE y Catastro sin redirecciones. Todos los marcadores aparecieron en los primeros 256 KiB de respuesta, interpretados como UTF-8 y comparados sin distinguir mayúsculas. La petición envió `Accept: application/json, application/xml;q=0.9, text/html;q=0.8, */*;q=0.1`, ya que la API del BOE requiere un tipo compatible.

Para los cinco recursos del catálogo inicial se aplicó el flujo de inspección de capturas archivadas de la skill Reverse Engineer Anything. La CLI de REA 6.10.1 leyó un HAR temporal de las cinco peticiones públicas con `inspect-web-network-capture`. La comprobación se limitó a URL, método, código HTTP, tipo de contenido y marcador observado. [Skill REA](https://github.com/morluto/rea/blob/42bbf33f2d29aadcaedf6f25d477c8e59157bdd0/.agents/skills/reverse-engineer-anything/SKILL.md), [guía de capturas archivadas](https://github.com/morluto/rea/blob/42bbf33f2d29aadcaedf6f25d477c8e59157bdd0/docs/guides/web/web-network-captures.md).

## Cobertura de Cita Previa DNI

El monitor comprueba los tres pasos públicos del acceso con datos del documento. La selección de provincia aparece después de identificarse y elegir el trámite. En la vía con datos DNI/NIE, la identificación pide los datos del documento y un código de seguridad. El funcionamiento del trámite por provincia queda sin verificar. [Manual oficial de Cita Previa DNI y Pasaporte, apartados 2.1, 2.4 y 2.5.1](https://www.citapreviadnie.es/citaPreviaDni/doc/43CITAPREVIAnivelinternet.pdf), [directorio del Ministerio del Interior](https://www.interior.gob.es/opencms/es/el-ministerio/directorio/servicios-perifericos/direccion-general-de-la-policia/).

El 24 de noviembre de 2026 la sonda obtuvo HTTP 200 sin redirecciones y encontró los tres marcadores. REA 6.10.1 verificó las URLs, el método, el código HTTP y el tipo de contenido en un HAR temporal de los tres GET anónimos. El HAR conservó metadatos de las respuestas HTTP. La comprobación de los marcadores se hizo con la sonda.

## Cobertura de Renfe

El visor y el archivo GTFS son las dos fuentes que usa el conector de Reforma Digital para consultar el estado de un tren y los retrasos. La sonda comprueba la respuesta de ambas fuentes y de la portada de Renfe. La actualidad de los datos, el contenido del horario, la búsqueda de billetes y la compra quedan fuera de esas comprobaciones. [Conector de Renfe](https://github.com/samuelcorsan/reforma-digital/tree/034d9006089e376bf29d30c13db0df067d2268b1/packages/renfe), [configuración del visor](https://github.com/samuelcorsan/reforma-digital/blob/034d9006089e376bf29d30c13db0df067d2268b1/packages/renfe/src/config.ts), [descarga del horario](https://github.com/samuelcorsan/reforma-digital/blob/034d9006089e376bf29d30c13db0df067d2268b1/packages/renfe/src/delays.ts).

El 24 de noviembre de 2026 la sonda obtuvo HTTP 200 de la portada y del visor, y HTTP 206 del archivo de horarios con `Content-Range: bytes 0-3/690309`. Las tres peticiones llegaron a la URL configurada sin redirecciones y devolvieron los marcadores esperados.

## Cobertura de Contratación del Estado

Se comprueban por separado los dos feeds Atom del [conector de licitaciones de Reforma Digital](https://github.com/samuelcorsan/reforma-digital/blob/main/packages/mcp/src/contratacion.ts). La sonda valida el identificador XML propio de cada feed en los primeros 256 KiB de su respuesta. La medición cubre el acceso al feed. La fecha de los anuncios y la tramitación de ofertas quedan fuera de su alcance.

## Cobertura de Reforma Digital

El 24 de noviembre de 2026, cinco de los diez conectores publicados en la biblioteca MCP de Reforma Digital compartían fuentes con el monitor. Las sondas consultan directamente el sumario histórico del BOE, el IPC del INE, el listado de provincias del Catastro, las dos fuentes de Renfe y los dos feeds de contratación descritos arriba. Los otros cinco conectores corresponden al Congreso de los Diputados, Eustat, precios de carburantes, Red Eléctrica y ALSA. Los destinos, marcadores y parámetros figuran en el catálogo. [Biblioteca MCP de Reforma Digital](https://reforma-digital.es/developers/mcp), [conector del BOE](https://github.com/samuelcorsan/reforma-digital/blob/034d9006089e376bf29d30c13db0df067d2268b1/packages/mcp/src/boe.ts), [conector del INE](https://github.com/samuelcorsan/reforma-digital/blob/034d9006089e376bf29d30c13db0df067d2268b1/packages/mcp/src/ine.ts), [conector del Catastro](https://github.com/samuelcorsan/reforma-digital/blob/034d9006089e376bf29d30c13db0df067d2268b1/packages/mcp/src/catastro.ts), [services.json](services.json).
