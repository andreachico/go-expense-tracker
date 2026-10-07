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
