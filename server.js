import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { probe } from './monitor.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const sites = JSON.parse(readFileSync(here('sites.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(here('services.json'), 'utf8'));
const services = catalog.map((service) => {
  const site = sites[service.siteId];
  if (!site) throw new Error('Web sin configurar para ' + service.id);
  return { ...service, siteName: site.name, siteUrl: site.url, siteLogo: site.logo };
});
const intervalSeconds = 300;
const dataDir = process.env.DATA_DIR || here('data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(dataDir + '/status.sqlite');
db.exec(`CREATE TABLE IF NOT EXISTS samples (
  id TEXT NOT NULL, url TEXT NOT NULL, at TEXT NOT NULL, state TEXT NOT NULL,
  ms INTEGER NOT NULL, detail TEXT NOT NULL, PRIMARY KEY(id,url,at)
)`);
db.exec('BEGIN IMMEDIATE');
try {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='count_sample' AND type='trigger'").get()) {
    db.exec(readFileSync(here('lifetime.sql'), 'utf8'));
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
const totals = db.prepare('SELECT since, up, down, unknown FROM lifetime WHERE id=? AND url=?');
const localDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
});
function lifetime(service) {
  const row = totals.get(service.id, service.url);
  return row ? { ...row, since: localDay.format(new Date(row.since)) } : null;
}
const insert = db.prepare('INSERT INTO samples VALUES (?, ?, ?, ?, ?, ?)');
const select = db.prepare(
  'SELECT at,state,ms,detail FROM samples WHERE id=? AND url=? AND at>=? ORDER BY at',
);
const cutoff = () => new Date(Date.now() - 30 * 86400000).toISOString();
let snapshot, compressed;
function refresh() {
  snapshot = JSON.stringify({
    generatedAt: new Date().toISOString(),
    intervalSeconds,
    services: services.map((service) => ({
      ...service,
      lifetime: lifetime(service),
      samples: select.all(service.id, service.url, cutoff()),
    })),
  });
  compressed = gzipSync(snapshot);
}
refresh();
async function collect() {
  const observations = await Promise.all(
    services.map((service) => probe(service)),
  );
  db.exec('BEGIN');
  try {
    observations.forEach(({ at, state, ms, detail }, index) => {
      const { id, url } = services[index];
      insert.run(id, url, at, state, ms, detail);
    });
    db.prepare('DELETE FROM samples WHERE at < ?').run(cutoff());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  refresh();
}
const routes = new Map([
  ['/', ['public/index.html', 'text/html']],
  ['/estado-watch-og.png', ['public/estado-watch-og.png', 'image/png']],
  ['/app.js', ['public/app.js', 'text/javascript']],
  ['/style.css', ['public/style.css', 'text/css']],
  ['/assets/icon.svg', ['assets/icon.svg', 'image/svg+xml']],
]);
for (const site of Object.values(sites)) {
  routes.set(site.logo, [site.logo.slice(1), 'image/png']);
}
const server = createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
  } else if (path === '/api/status') {
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
      ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    res.end(gzip ? compressed : snapshot);
  } else if (/^\/fonts\/[a-zA-Z0-9_.-]+\.woff2$/.test(path)) {
    try {
      const font = readFileSync(here('public' + path));
      res.writeHead(200, {'Content-Type': 'font/woff2'}).end(font);
    } catch {
      res.writeHead(404).end();
    }
  } else if (routes.has(path)) {
    const [file, type] = routes.get(path);
    try {
      const body = readFileSync(here(file));
      res
        .writeHead(200, { 'Content-Type': type + '; charset=utf-8' })
        .end(body);
    } catch {
      res.writeHead(500).end();
    }
  } else {
    res.writeHead(404).end();
  }
});
server.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || '127.0.0.1',
  async () => {
    console.log('estado.watch en el puerto', server.address().port);
    async function tick() {
      try {
        await collect();
      } catch (error) {
        console.error('Error al guardar la ronda', error);
      }
      setTimeout(tick, intervalSeconds * 1000);
    }
    await tick();
  },
);
