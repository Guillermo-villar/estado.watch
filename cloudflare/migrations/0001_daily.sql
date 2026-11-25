CREATE TABLE daily (
  id TEXT NOT NULL,
  url TEXT NOT NULL,
  day TEXT NOT NULL,
  up INTEGER NOT NULL,
  down INTEGER NOT NULL,
  unknown INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  at TEXT NOT NULL,
  state TEXT NOT NULL,
  ms INTEGER NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY(id, url, day)
);
CREATE INDEX daily_expiry ON daily(day);
