import { performance } from 'node:perf_hooks';

// A failed check is repeated once before it counts as an outage, so a single
// dropped connection or slow response is not recorded as down.
export async function probe(service, request = fetch, { retryDelay = 5000 } = {}) {
  const first = await attempt(service, request);
  if (first.state !== 'down') return first;
  await new Promise((resolve) => setTimeout(resolve, retryDelay));
  return attempt(service, request);
}

async function attempt(service, request) {
  const prefix = service.markerType === 'hex-prefix'
    ? Buffer.from(service.marker.replaceAll(' ', ''), 'hex')
    : null;
  const start = performance.now();
  const result = (state, detail) => ({
    at: new Date().toISOString(),
    state,
    detail,
    ms: Math.round(performance.now() - start),
  });
  try {
    const response = await request(service.url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(prefix ? { Range: `bytes=0-${prefix.length - 1}` } : {}),
        'User-Agent': 'estado.watch/0.1 (public availability monitor)',
        Accept:
          'application/json, application/xml;q=0.9, text/html;q=0.8, */*;q=0.1',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return result(
        response.status >= 500 ? 'down' : 'unknown',
        'HTTP ' + response.status,
      );
    }
    if (!response.body) return result('unknown', 'Respuesta sin contenido');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    const limit = prefix?.length ?? 256 * 1024;
    try {
      while (size < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value.subarray(0, limit - size);
        chunks.push(chunk);
        size += chunk.length;
      }
    } finally {
      await reader.cancel();
    }
    const body = Buffer.concat(chunks);
    const matches = prefix
      ? body.equals(prefix)
      : body.toString('utf8').toLowerCase().includes(service.marker.toLowerCase());
    return result(
      matches ? 'up' : 'unknown',
      matches ? 'HTTP ' + response.status : 'Contenido inesperado',
    );
  } catch (error) {
    const code = error.cause?.code ?? error.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      return result('unknown', 'La sonda no pudo resolver el dominio (DNS)');
    }
    return result(
      'down',
      error.name === 'TimeoutError'
        ? 'Tiempo de espera agotado'
        : 'Error de conexión desde la sonda',
    );
  }
}
