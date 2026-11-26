import sources from '../observation-sources.json' with { type: 'json' };
import { probe } from '../monitor.js';

const request = (url, options) => fetch(url, { ...options, redirect: 'manual' });

for (const source of sources) {
  const { at, state, detail, ms } = await probe(source, request);
  console.log(JSON.stringify({
    id: source.id,
    at,
    ms,
    observation: state === 'up' ? 'marker_seen' : 'unconfirmed',
    detail,
  }));
}
