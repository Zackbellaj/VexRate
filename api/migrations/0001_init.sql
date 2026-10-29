CREATE TABLE pairs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_ccy   TEXT NOT NULL,
  to_ccy     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (from_ccy, to_ccy)
);

-- One row per pair per Visa rate date.
-- visa_rate = how many `from_ccy` units 1 `to_ccy` costs on a `from_ccy` card
-- (e.g. pair MAD->EUR, visa_rate 11.0785 means 1 EUR = 11.0785 MAD).
CREATE TABLE rates (
  pair_id    INTEGER NOT NULL REFERENCES pairs(id) ON DELETE CASCADE,
  as_of      TEXT    NOT NULL, -- YYYY-MM-DD (UTC), as reported by Visa
  visa_rate  REAL    NOT NULL,
  fetched_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (pair_id, as_of)
);
