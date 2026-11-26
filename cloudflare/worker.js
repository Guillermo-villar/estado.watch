import { services } from '../catalog.js';
import sites from '../sites.json';
import { probeAll } from '../monitor.js';

import { longOutageDays, threeHours } from '../outages.js';

// Extend a run only when the immediately preceding scheduled check failed.
const recordOutage = `INSERT INTO outages(id,url,start,end)
  VALUES(?1,?2,COALESCE((SELECT start FROM outages WHERE id=?1 AND url=?2
    AND end IN (?3-300000,?3) ORDER BY start LIMIT 1),?3),?3)
  ON CONFLICT(id,url,start) DO UPDATE SET end=MAX(outages.end,excluded.end)`;

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
    const samples = await probeAll(services);
    const rows = services.map((service, index) => {
      const sample = samples[index];
      const daily = env.DB.prepare(save).bind(service.id, service.url,
        localDay.format(new Date(sample.at)), Number(sample.state === 'up'),
        Number(sample.state === 'down'), Number(sample.state === 'unknown'),
        tick, sample.at, sample.state, sample.ms, sample.detail);
      return sample.state === 'down'
        ? [daily, env.DB.prepare(recordOutage).bind(service.id, service.url, tick)]
        : [daily];
    });
    rows.push(env.DB.prepare('DELETE FROM daily WHERE day < ?')
      .bind(localDay.format(tick - 30 * 86400000)));
    rows.push(env.DB.prepare('DELETE FROM outages WHERE end < ?').bind(tick - 31 * 86400000));
    await env.DB.batch(rows.flat());
  },

  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/status') return env.ASSETS.fetch(request);
    if (!['GET','HEAD'].includes(request.method)) {
      return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
    }
    const [{results}, totals, outages] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM daily ORDER BY day'),
      env.DB.prepare('SELECT * FROM lifetime'),
      env.DB.prepare('SELECT * FROM outages WHERE end-start > ?').bind(threeHours)
    ]);
    const catalog = services.map(service => {
      const site = sites[service.siteId];
      const history = results.filter(row => row.id === service.id && row.url === service.url);
      const total = totals.results.find(row => row.id === service.id && row.url === service.url);
      const lifetime = total ? {since:total.since,up:total.up,down:total.down,unknown:total.unknown} : null;
      const last = history.at(-1);
      const samples = last ? [{at:last.at,state:last.state,ms:last.ms,detail:last.detail}] : [];
      return { ...service, siteName:site.name, siteUrl:site.url, siteLogo:site.logo,
        longOutageDays: longOutageDays(outages.results.filter(row => row.id === service.id && row.url === service.url)),
        lifetime, samples, daily:history.map(({day,up,down,unknown}) => ({day,up,down,unknown})) };
    });
    return new Response(request.method === 'HEAD' ? null : JSON.stringify({
      generatedAt:new Date().toISOString(), intervalSeconds:300, services:catalog
    }), {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=30'}});
  }
};
