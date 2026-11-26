import existing from './services.json' with { type: 'json' };
import sources from './observation-sources.json' with { type: 'json' };

export const directSources = sources.map(source => ({ ...source, verification: 'direct-content' }));
export const services = [...existing, ...directSources];
