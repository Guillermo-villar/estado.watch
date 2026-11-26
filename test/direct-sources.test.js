import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directSources, services } from '../catalog.js';
import { probe, probeAll } from '../monitor.js';

const reference = { pc1: '1446401', pc2: 'VK4714E', car: '0001', cc1: 'H', cc2: 'Z' };
const valid = {
  'catastro-inmueble': JSON.stringify({ consulta_dnprcResult: { bico: { bi: { idbi: { rc: reference } } } } }),
  'aeat-cita': '<form id="FormParaQuien"><button id="btnSiguienteParaQuien">Siguiente</button></form>',
  'seg-social-cita': '<a id="btnacceder_1" href="https://w6.seg-social.es/ProsaInternetAnonimo/OnlineAccess?ARQ.IDAPP=CPMSWACS">Obtener</a>',
  'seg-social-cita-reserva': '<Provincias><combo><elementoCombo><codigo><![CDATA[15]]></codigo><descripcion><![CDATA[A CORUNA]]></descripcion></elementoCombo></combo></Provincias>',
  'sepe-cita': '<a href="/portalSede/procedimientos-y-servicios/personas/proteccion-por-desempleo/cita-previa/cita-previa-solicitud.html"><span>Iniciar Solicitud / Anular Cita</span></a>',
  'sepe-cita-aplicacion': '<input id="moduloNivelesServicio"><select id="datosIdiomas"></select><div id="tablaCitasPrevias"></div>',
};

test('evidencia de cada recurso y falsos positivos con el marcador aislado', async () => {
  for (const source of directSources) {
    const check = body => probe(source, async (_, options) => {
      assert.equal(options.redirect, 'manual');
      return new Response(body);
    });
    assert.equal((await check(valid[source.id])).state, 'up', source.id);
    assert.equal((await check(source.marker)).state, 'unknown', source.id);
  }
  const catastro = directSources.find(source => source.id === 'catastro-inmueble');
  for (const body of ['{"bico":null}', valid[catastro.id].replace('1446401', '0000000')]) {
    assert.equal((await probe(catastro, () => new Response(body))).state, 'unknown');
  }
});

test('los fallos de una sonda de contenido directo quedan sin confirmar', async () => {
  const source = directSources.find(s => s.id === 'sepe-cita-aplicacion');
  for (const status of [302, 403, 429, 503]) {
    const sample = await probe(source, () => new Response(null, { status }));
    assert.equal(sample.state, 'unknown');
    assert.equal(sample.detail, 'HTTP ' + status);
  }
  const timeout = await probe(source, () => { throw new DOMException('timeout', 'TimeoutError'); });
  assert.equal(timeout.state, 'unknown');
});

test('la ronda da turno a seis peticiones a la vez y conserva el orden del catálogo', async () => {
  const started = [];
  const waiting = [];
  const round = probeAll(services, url => {
    started.push(url);
    const status = 400 + started.length;
    return new Promise(resolve => waiting.push(() => resolve(new Response(null, { status }))));
  });
  assert.deepEqual(started, services.slice(0, 6).map(s => s.url));
  for (let i = 0; i < services.length; i++) {
    waiting.pop()();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(waiting.length <= 6);
  }
  assert.deepEqual(started, services.map(s => s.url));
  const samples = await round;
  assert.deepEqual(samples.map(s => s.detail), services.map((_, index) => 'HTTP ' + (401 + index)));
});
