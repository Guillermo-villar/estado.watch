import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probe } from '../monitor.js';

const service = { url: 'https://example.invalid/', marker: 'boletín' };
for (const [label, code, body, expected] of [
  ['respuesta esperada', 200, 'BOLETÍN', 'up'],
  ['página de desafío', 200, 'Verifica tu navegador', 'unknown'],
  ['límite de peticiones', 429, '', 'unknown'],
  ['servicio indisponible', 503, '', 'down'],
  ['marcador fuera del límite', 200, ' '.repeat(262144) + 'BOLETÍN', 'unknown'],
]) {
  test(label, async () => {
    const sample = await probe(
      service,
      async () => new Response(body, { status: code }),
      { retryDelay: 0 },
    );
    assert.equal(sample.state, expected);
    assert.ok(Number.isFinite(Date.parse(sample.at)));
  });
}
test('conexión agotada', async () => {
  const result = await probe(service, async () => {
    throw new DOMException('timeout', 'TimeoutError');
  }, { retryDelay: 0 });
  assert.equal(result.state, 'down');
  assert.equal(result.detail, 'Tiempo de espera agotado');
});

test('HTTP 204 sin cuerpo es inconcluyente', async () => {
  const result = await probe(service, async () => new Response(null, { status: 204 }));
  assert.equal(result.state, 'unknown');
});

test('el horario GTFS requiere la cabecera ZIP exacta al inicio', async () => {
  const zip = { ...service, marker: '50 4B 03 04', markerType: 'hex-prefix' };
  for (const [hex, expected] of [['504b0304ff','up'], ['00504b0304','unknown'], ['504b','unknown']]) {
    const result = await probe(zip, async (_, options) => {
      assert.equal(options.headers.Range, 'bytes=0-3');
      return new Response(Buffer.from(hex, 'hex'), {status: 206});
    });
    assert.equal(result.state, expected);
  }
});

test('una resolución DNS fallida deja el estado sin confirmar', async () => {
  const result = await probe(service, async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  });
  assert.equal(result.state, 'unknown');
  assert.match(result.detail, /DNS/);
});

test('un fallo aislado se reintenta y no cuenta como caída', async () => {
  let calls = 0;
  const result = await probe(service, async () => {
    calls++;
    return calls === 1
      ? new Response('', { status: 503 })
      : new Response('boletín', { status: 200 });
  }, { retryDelay: 0 });
  assert.equal(calls, 2);
  assert.equal(result.state, 'up');
});

test('la caída se confirma si el reintento también falla', async () => {
  let calls = 0;
  const result = await probe(service, async () => {
    calls++;
    return new Response('', { status: 502 });
  }, { retryDelay: 0 });
  assert.equal(calls, 2);
  assert.equal(result.state, 'down');
  assert.equal(result.detail, 'HTTP 502');
});

test('los resultados no concluyentes no se reintentan', async () => {
  let calls = 0;
  await probe(service, async () => {
    calls++;
    return new Response('', { status: 429 });
  }, { retryDelay: 0 });
  assert.equal(calls, 1);
});
