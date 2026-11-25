import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url));
const sites = JSON.parse(read('sites.json'));
const services = JSON.parse(read('services.json'));

test('cada sonda tiene una web conocida y un identificador único', () => {
  assert.equal(new Set(services.map(service => service.id)).size, services.length);
  for (const service of services) {
    assert.ok(Object.hasOwn(sites, service.siteId), service.id);
    assert.ok(service.marker.trim(), service.id);
    if (service.markerType !== undefined) {
      assert.equal(service.markerType, 'hex-prefix', service.id);
      assert.match(service.marker, /^[0-9a-f]{2}( [0-9a-f]{2})*$/i, service.id);
    }
  }
});

test('cada web desplegable tiene un servicio y un icono PNG local', () => {
  for (const [id, site] of Object.entries(sites)) {
    assert.ok(services.some(service => service.siteId === id), id);
    assert.equal(new URL(site.url).protocol, 'https:');
    assert.match(site.logo, /^\/assets\/logos\/[a-z0-9-]+\.png$/);
    assert.equal(read(site.logo.slice(1)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
