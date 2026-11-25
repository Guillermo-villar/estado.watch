CREATE TABLE IF NOT EXISTS lifetime (
  id TEXT NOT NULL, url TEXT NOT NULL, since TEXT NOT NULL,
  up INTEGER NOT NULL, down INTEGER NOT NULL, unknown INTEGER NOT NULL,
  PRIMARY KEY (id, url)
);
INSERT OR IGNORE INTO lifetime
SELECT id, url, MIN(at), SUM(state='up'), SUM(state='down'), SUM(state='unknown')
FROM samples GROUP BY id, url;

CREATE TRIGGER IF NOT EXISTS count_sample AFTER INSERT ON samples BEGIN
  INSERT INTO lifetime VALUES (NEW.id, NEW.url, NEW.at, NEW.state='up', NEW.state='down', NEW.state='unknown')
  ON CONFLICT(id,url) DO UPDATE SET since=MIN(lifetime.since,excluded.since),
    up=lifetime.up+excluded.up, down=lifetime.down+excluded.down, unknown=lifetime.unknown+excluded.unknown;
END;
