CREATE TABLE lifetime (
  id TEXT NOT NULL, url TEXT NOT NULL, since TEXT NOT NULL,
  up INTEGER NOT NULL, down INTEGER NOT NULL, unknown INTEGER NOT NULL,
  PRIMARY KEY (id,url)
);
INSERT INTO lifetime
SELECT id,url,MIN(day),SUM(up),SUM(down),SUM(unknown) FROM daily GROUP BY id,url;

CREATE TRIGGER count_new_day AFTER INSERT ON daily BEGIN
  INSERT INTO lifetime VALUES (NEW.id,NEW.url,NEW.day,NEW.up,NEW.down,NEW.unknown)
  ON CONFLICT(id,url) DO UPDATE SET since=MIN(lifetime.since,excluded.since),
    up=lifetime.up+excluded.up,down=lifetime.down+excluded.down,unknown=lifetime.unknown+excluded.unknown;
END;
CREATE TRIGGER count_updated_day AFTER UPDATE ON daily BEGIN
  UPDATE lifetime SET up=up+NEW.up-OLD.up, down=down+NEW.down-OLD.down,
    unknown=unknown+NEW.unknown-OLD.unknown WHERE id=NEW.id AND url=NEW.url;
END;
