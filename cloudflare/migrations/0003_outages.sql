CREATE TABLE outages (
  id TEXT NOT NULL, url TEXT NOT NULL, start INTEGER NOT NULL, end INTEGER NOT NULL,
  PRIMARY KEY (id, url, start)
);
CREATE INDEX outages_end ON outages(id, url, end);
CREATE INDEX outages_expiry ON outages(end);
