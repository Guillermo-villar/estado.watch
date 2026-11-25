import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const sql = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('SQLite recupera el histórico y conserva los totales tras purgar muestras', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE samples(id,url,at,state,ms,detail); INSERT INTO samples VALUES('a','url','2026-01-01','down',1,'');");
  db.exec(sql('lifetime.sql'));
  db.exec("INSERT INTO samples VALUES('a','url','2026-02-01','up',1,''); DELETE FROM samples;");
  const total = db.prepare('SELECT * FROM lifetime').get();
  assert.equal(total.since, '2026-01-01');
  assert.equal(total.up, 1);
  assert.equal(total.down, 1);
  db.close();
});

test('D1 incorpora días existentes y cuenta solo el incremento posterior', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(sql('cloudflare/migrations/0001_daily.sql'));
  db.exec("INSERT INTO daily VALUES('a','url','2026-01-01',4,1,2,1,'t','up',1,'');");
  db.exec(sql('cloudflare/migrations/0002_lifetime.sql'));
  db.exec("UPDATE daily SET up=up+1; DELETE FROM daily; INSERT INTO daily VALUES('a','url','2026-02-01',0,1,0,2,'t','down',1,'');");
  const total = db.prepare('SELECT * FROM lifetime').get();
  assert.deepEqual([total.since,total.up,total.down,total.unknown], ['2026-01-01',5,2,2]);
  db.close();
});
