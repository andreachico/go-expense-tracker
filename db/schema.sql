-- This file runs automatically the first time the Postgres container starts
-- (it is mounted into /docker-entrypoint-initdb.d). It creates the tables the
-- app needs.

-- User accounts. Passwords are stored only as bcrypt hashes, never in plaintext.
-- A unique index on the lowercased username makes logins case-insensitive and
-- prevents duplicate accounts that differ only in case.
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL,
    email         TEXT NOT NULL DEFAULT '',
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS expenses (
    id          SERIAL PRIMARY KEY,                 -- auto-incrementing integer ID
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    category    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    date        DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses (user_id);

-- NOTE: real money apps should store amounts as integer cents or NUMERIC to
-- avoid floating-point rounding. We use DOUBLE PRECISION here because the Go
-- model uses float64, keeping this learning project simple.

-- Income: money received in a given month (salary, side-jobs, etc.). Each row is
-- one source scoped to a user and a "YYYY-MM" month.
CREATE TABLE IF NOT EXISTS income (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source  TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS income_user_month_idx ON income (user_id, month);

-- Savings and investments: each row is one named entry scoped to a user and a
-- "YYYY-MM" month. They share the same shape (name, amount, month) and mirror
-- the income table.
CREATE TABLE IF NOT EXISTS savings (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS savings_user_month_idx ON savings (user_id, month);

CREATE TABLE IF NOT EXISTS investments (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investments_user_month_idx ON investments (user_id, month);

-- Debts come in two kinds: one-time payments (kind='onetime', paid in full in a
-- single month) and installment plans / Ratenzahlungen (kind='installment', a
-- total paid off in fixed monthly rates over a term). A one-time debt is stored
-- as a 1-month plan. The per-month payment schedule is derived from these fields;
-- paid_months is how many installments have been paid so far.
CREATE TABLE IF NOT EXISTS debts (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind         TEXT NOT NULL DEFAULT 'installment',
    name         TEXT NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL CHECK (total_amount > 0),
    monthly_rate DOUBLE PRECISION NOT NULL CHECK (monthly_rate > 0),
    term_months  INTEGER NOT NULL CHECK (term_months > 0),
    start_month  TEXT NOT NULL,
    paid_months  INTEGER NOT NULL DEFAULT 0 CHECK (paid_months >= 0)
);
CREATE INDEX IF NOT EXISTS debts_user_idx ON debts (user_id);

-- The budget sheet is stored per user and month as a flat key/value map: each
-- row is one planned entry, keyed by "section:row" (e.g. "fix:miete") plus meta
-- keys like "meta:paycheck", scoped to a "YYYY-MM" month. Type/category/due
-- carry each row's labels so user-added rows survive a round-trip. A month's
-- plan is replaced on each save.
CREATE TABLE IF NOT EXISTS budget_amounts (
    user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month     TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT '',
    category  TEXT NOT NULL DEFAULT '',
    amount    DOUBLE PRECISION NOT NULL,
    due       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, month, entry_key)
);
