import services from '../services.json';
import sites from '../sites.json';
import { probe } from '../monitor.js';

const localDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
});
const save = `INSERT INTO daily(id,url,day,up,down,unknown,tick,at,state,ms,detail)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id,url,day) DO UPDATE SET
    up=daily.up+excluded.up, down=daily.down+excluded.down,
    unknown=daily.unknown+excluded.unknown, tick=excluded.tick,
    at=excluded.at,state=excluded.state,ms=excluded.ms,detail=excluded.detail
  WHERE excluded.tick>daily.tick`;

export default {
  async scheduled(event, env) {
    const tick = event.scheduledTime;
    const rows = await Promise.all(services.map(async service => {
      const sample = await probe(service);
      return env.DB.prepare(save).bind(service.id, service.url,
        localDay.format(new Date(sample.at)), Number(sample.state === 'up'),
        Number(sample.state === 'down'), Number(sample.state === 'unknown'),
        tick, sample.at, sample.state, sample.ms, sample.detail);
    }));
    rows.push(env.DB.prepare('DELETE FROM daily WHERE day < ?')
      .bind(localDay.format(tick - 30 * 86400000)));
    await env.DB.batch(rows);
  },

  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/status') return env.ASSETS.fetch(request);
    if (!['GET','HEAD'].includes(request.method)) {
      return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
    }
    const [{results}, totals] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM daily ORDER BY day'),
      env.DB.prepare('SELECT * FROM lifetime')
    ]);
    const catalog = services.map(service => {
      const site = sites[service.siteId];
      const history = results.filter(row => row.id === service.id && row.url === service.url);
      const total = totals.results.find(row => row.id === service.id && row.url === service.url);
      const lifetime = total ? {since:total.since,up:total.up,down:total.down,unknown:total.unknown} : null;
      const last = history.at(-1);
      const samples = last ? [{at:last.at,state:last.state,ms:last.ms,detail:last.detail}] : [];
      return { ...service, siteName:site.name, siteUrl:site.url, siteLogo:site.logo,
        lifetime, samples, daily:history.map(({day,up,down,unknown}) => ({day,up,down,unknown})) };
    });
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({
      generatedAt:new Date().toISOString(), intervalSeconds:300, services:catalog
    }), {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30'}});
  }
};
