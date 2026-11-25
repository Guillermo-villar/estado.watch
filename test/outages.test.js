import test from 'node:test';
import assert from 'node:assert/strict';
import { longOutageDays, sampleOutages } from '../outages.js';

test('el rojo exige más de tres horas continuas y alcanza ambos días de Madrid', () => {
  const start = Date.parse('2026-11-24T21:00:00Z');
  const samples = Array.from({length: 38}, (_, i) => ({
    at: new Date(start + i * 300000).toISOString(), state: 'down'
  }));
  const days = rows => longOutageDays(sampleOutages(rows));
  assert.deepEqual(days(samples.slice(0, 37)), []);
  assert.deepEqual(days(samples), ['2026-11-24', '2026-11-25']);
  assert.deepEqual(days(samples.filter((_, i) => i !== 15)), []);
  for (const state of ['up', 'unknown']) {
    assert.deepEqual(days(samples.map((s, i) => i === 15 ? {...s, state} : s)), []);
  }
});
