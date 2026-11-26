import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { directSources as sources, services } from '../catalog.js';

test('las seis observaciones también están en el catálogo programado una sola vez', () => {
  assert.deepEqual(sources.map(source => source.id).sort(), [
    'aeat-cita', 'catastro-inmueble', 'seg-social-cita',
    'seg-social-cita-reserva', 'sepe-cita', 'sepe-cita-aplicacion',
  ]);
  for (const source of sources) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.marker.trim());
    assert.deepEqual(services.filter(service => service.id === source.id || service.url === source.url), [source]);
  }
});

test('el comando solo informa del marcador observado o de una lectura sin confirmar', () => {
  const replies = {
    'catastro-inmueble': [503, 'Servicio no disponible'],
    'aeat-cita': [200, 'Verifica tu navegador'],
    'seg-social-cita': [429, 'Demasiadas peticiones'],
    'seg-social-cita-reserva': [302, ''],
    'sepe-cita': [200, '<a href="/portalSede/procedimientos-y-servicios/personas/proteccion-por-desempleo/cita-previa/cita-previa-solicitud.html">Iniciar Solicitud</a>'],
    'sepe-cita-aplicacion': [403, 'Acceso denegado'],
  };
  const responsesByUrl = Object.fromEntries(sources.map(source => [source.url, replies[source.id]]));
  const mock = `
    const replies = ${JSON.stringify(responsesByUrl)};
    globalThis.fetch = async (url, options) => {
      const [status, body] = replies[url];
      if (status === 302 && options.redirect !== 'manual') {
        return new Response('<Provincias>');
      }
      return new Response(body, { status });
    };
  `;
  const script = fileURLToPath(new URL('../scripts/observe-sources.js', import.meta.url));
  const output = execFileSync(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(mock), script,
  ], { encoding: 'utf8' });
  const observations = output.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(observations.map(row => row.id), sources.map(source => source.id));
  for (const row of observations) {
    const [status] = replies[row.id];
    assert.equal(row.observation, row.id === 'sepe-cita' ? 'marker_seen' : 'unconfirmed');
    assert.equal(row.detail, row.id === 'sepe-cita' || status !== 200
      ? 'HTTP ' + status : 'Contenido inesperado');
    assert.ok(Number.isFinite(Date.parse(row.at)));
  }
});
