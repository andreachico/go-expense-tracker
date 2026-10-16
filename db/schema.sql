-- This file runs automatically the first time the Postgres container starts
-- (it is mounted into /docker-entrypoint-initdb.d). It creates the single table
-- the app needs.

CREATE TABLE IF NOT EXISTS expenses (
    id          SERIAL PRIMARY KEY,                 -- auto-incrementing integer ID
    amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    category    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    date        DATE NOT NULL
);

-- NOTE: real money apps should store amounts as integer cents or NUMERIC to
-- avoid floating-point rounding. We use DOUBLE PRECISION here because the Go
-- model uses float64, keeping this learning project simple.

-- The budget sheet is stored per month as a flat key/value map: each row is one
-- planned entry, keyed by "section:row" (e.g. "fix:miete") plus meta keys like
-- "meta:paycheck", scoped to a "YYYY-MM" month. Type/category/due carry each
-- row's labels so user-added rows survive a round-trip. A month's plan is
-- replaced on each save.
CREATE TABLE IF NOT EXISTS budget_amounts (
    month     TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT '',
    category  TEXT NOT NULL DEFAULT '',
    amount    DOUBLE PRECISION NOT NULL,
    due       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (month, entry_key)
);
