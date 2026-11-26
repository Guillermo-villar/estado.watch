import { directSources } from '../catalog.js';
import { probe } from '../monitor.js';

for (const source of directSources) {
  const { at, state, detail, ms } = await probe(source);
  console.log(JSON.stringify({
    id: source.id,
    at,
    ms,
    observation: state === 'up' ? 'marker_seen' : 'unconfirmed',
    detail,
  }));
}
