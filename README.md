# go-expense-tracker

[![CI](https://github.com/andreachico/go-expense-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/andreachico/go-expense-tracker/actions/workflows/ci.yml)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

A full-stack personal finance tracker: a RESTful **Go + PostgreSQL** API paired
with a **Next.js + TypeScript** dashboard, all runnable in Docker. It tracks
expenses, income, savings, investments, debts (one-time payments and installment
plans), and a per-month budget sheet — all behind cookie-based authentication, so
each user sees only their own data. A learning project focused on Go backend
development, REST APIs, database integration, testing, clean project structure,
and a modern React frontend.

## Architecture

HTTP requests flow through a router to per-domain handlers, which depend only on a
`Store` **interface** — so the same code runs against either the in-memory or the
PostgreSQL implementation, chosen at startup. Every route except `/health` and
`/auth/*` sits behind `RequireAuth`, which verifies the signed session cookie and
injects the user ID into the request context so each store scopes data per user.

```mermaid
flowchart LR
    browser[Next.js dashboard] -->|/api proxy| mux
    client[HTTP client] --> mux[ServeMux router]
    mux --> mw[logging middleware]
    mw --> pub["/health, /auth/*"]
    mw --> guard[RequireAuth]
    guard --> handlers["expense / budget / income / savings / investment / debt handlers"]
    handlers -->|Store interface| iface{{Store}}
    iface --> mem[MemoryStore]
    iface --> pg[PostgresStore]
    pg --> db[(PostgreSQL)]
```

## Project layout

```
go-expense-tracker/
├── main.go                     # entry point: wires auth + every store and route, starts the server
├── Dockerfile                  # multi-stage build -> tiny distroless runtime image
├── .dockerignore               # keeps the Docker build context small
├── docker-compose.yml          # runs the full stack: app + PostgreSQL
├── db/
│   └── schema.sql              # users, expenses, income, savings, investments, debts, budget tables
├── internal/
│   ├── auth/                   # user accounts, bcrypt passwords, signed session cookies, RequireAuth
│   ├── expense/                # expense model, Store interface, in-memory + Postgres impls, handlers
│   ├── budget/                 # per-month budget sheet (flat key/value plan)
│   ├── income/                 # monthly income sources
│   ├── savings/                # monthly savings entries
│   ├── investment/             # monthly investment entries
│   └── debt/                   # one-time payments + installment plans (Ratenzahlungen)
├── test/
│   └── integration/            # DB-backed tests (run with -tags=integration)
└── web/                        # Next.js frontend (App Router, TypeScript, Tailwind)
    └── src/
        ├── app/                # login + a page per resource (server + client components)
        └── lib/                # typed API client and server-side data loader
```

Each `internal/` package follows the same shape: a model with validation rules, a
`Store` **interface**, and `MemoryStore` + `PostgresStore` implementations that
both satisfy it — so the HTTP handlers are identical no matter which backend is
active.

## Run it

### In-memory (zero setup)

```bash
go run .
# DATABASE_URL not set — using in-memory store
# server running on http://localhost:8080
```

### With PostgreSQL

```bash
# 1. Start the database (requires Docker)
docker compose up -d

# 2. Point the app at it and run
export DATABASE_URL="postgres://expense:expense@localhost:5432/expenses?sslmode=disable"
go run .
# connected to PostgreSQL
```

If port 5432 is already in use by another local Postgres, pick a different host
port and match it in the URL:

```bash
DB_PORT=5433 docker compose up -d
export DATABASE_URL="postgres://expense:expense@localhost:5433/expenses?sslmode=disable"
```

When `DATABASE_URL` is set the app uses Postgres; otherwise it falls back to the
in-memory store. Credentials come from the environment — never hardcoded.

> Tip: copy `.env.example` to `.env` and the backend loads it automatically on
> startup (via `godotenv`), so `go run .` picks up `DATABASE_URL` without any
> manual `export`. Real environment variables still take precedence.

### Accounts & sessions

Every route except `GET /health` and `/auth/*` requires a logged-in user. Register
an account, then log in — the API sets a signed, HttpOnly `session` cookie that the
browser (and the `/api` proxy) send on every request, scoping all data to that
user. Passwords are stored only as bcrypt hashes.

Two optional environment variables control sessions:

- `SESSION_SECRET` — key used to sign session cookies. Set a long, random value in
  production so logins survive restarts; if unset, a random key is generated and
  everyone is logged out on each restart.
- `COOKIE_SECURE` — set to `true` to mark the cookie HTTPS-only (leave unset for
  `http://localhost` development).

### Frontend (Next.js)

A small dashboard UI lives in `web/`. Run it alongside the API:

```bash
# terminal 1 — the Go API (in-memory or Postgres, your choice)
go run .

# terminal 2 — the frontend
cd web
npm install   # first time only
npm run dev
```

Open http://localhost:3000. The browser calls same-origin `/api/*`, which
Next.js proxies to the Go API on `:8080` (configured in `web/next.config.ts`),
so there's no CORS setup. You'll land on the login page first — register an
account, then the sidebar gives you expenses, the budget sheet, income, savings,
investments, and debts. Initial data is server-rendered; create/update/delete
happen client-side.

### Full stack in Docker (app + database)

Run everything in containers — no local Go toolchain needed:

```bash
docker compose up --build
# expense-db   ... healthy
# expense-app  connected to PostgreSQL
# API on http://localhost:8080
```

The app image is a multi-stage build: a Go image compiles a static binary, which
is copied into a minimal `distroless` runtime (~20 MB, no shell). Inside the
compose network the app reaches the database at host `db`, so the published
`DB_PORT` is only for connecting from your laptop.

## API

All responses are JSON. Every route **except** `GET /health` and the `/auth/*`
endpoints requires authentication: send the signed `session` cookie set by
register/login. Unauthenticated requests get `401`. Validation failures return
`400` with `{"error": "..."}`.

### Authentication

| Method | Path             | Body (JSON)                                        | Success |
|--------|------------------|----------------------------------------------------|---------|
| POST   | `/auth/register` | `{username, email, password, firstName, lastName}` | 201     |
| POST   | `/auth/login`    | `{username, password}`                             | 200     |
| POST   | `/auth/logout`   | –                                                  | 204     |
| GET    | `/auth/me`       | –                                                  | 200     |

### Expenses

| Method | Path             | Body (JSON)                             | Success |
|--------|------------------|-----------------------------------------|---------|
| GET    | `/expenses`      | –                                       | 200     |
| POST   | `/expenses`      | `{amount, category, description, date}` | 201     |
| GET    | `/expenses/{id}` | –                                       | 200     |
| PUT    | `/expenses/{id}` | `{amount, category, description, date}` | 200     |
| DELETE | `/expenses/{id}` | –                                       | 204     |

Validation: `amount` must be greater than 0 and `category` is required.

### Income, savings & investments

Three sibling resources with the same shape, grouped by a `YYYY-MM` month.

| Method | Path                  | Body (JSON)               | Success |
|--------|-----------------------|---------------------------|---------|
| GET    | `/income?month=`      | –                         | 200     |
| POST   | `/income`             | `{source, amount, month}` | 201     |
| DELETE | `/income/{id}`        | –                         | 204     |
| GET    | `/savings?month=`     | –                         | 200     |
| POST   | `/savings`            | `{name, amount, month}`   | 201     |
| DELETE | `/savings/{id}`       | –                         | 204     |
| GET    | `/investments?month=` | –                         | 200     |
| POST   | `/investments`        | `{name, amount, month}`   | 201     |
| DELETE | `/investments/{id}`   | –                         | 204     |

### Debts

One-time payments and installment plans (Ratenzahlungen). A one-time debt is
stored as a single-month plan; `PATCH` advances how many months have been paid.

| Method | Path          | Body (JSON)                                                                     | Success |
|--------|---------------|--------------------------------------------------------------------------------|---------|
| GET    | `/debts`      | –                                                                              | 200     |
| POST   | `/debts`      | installment: `{kind:"installment", name, totalAmount, monthlyRate, termMonths, startMonth}` · one-time: `{kind:"onetime", name, totalAmount, startMonth}` | 201 |
| GET    | `/debts/{id}` | –                                                                              | 200     |
| PUT    | `/debts/{id}` | same shape as `POST`                                                            | 200     |
| PATCH  | `/debts/{id}` | `{paidMonths}`                                                                  | 200     |
| DELETE | `/debts/{id}` | –                                                                              | 204     |

### Budget sheet

A month's plan is a flat map of `"section:row"` keys to entries; saving replaces
the whole month.

| Method | Path             | Body (JSON)                                           | Success |
|--------|------------------|-------------------------------------------------------|---------|
| GET    | `/budget?month=` | –                                                     | 200     |
| PUT    | `/budget?month=` | `{ "fix:miete": {type, category, amount, due}, ... }` | 200     |

### Examples

```bash
# register an account (saves the session cookie to a jar file)
curl -c jar -X POST localhost:8080/auth/register \
  -d '{"username":"ada","email":"ada@example.com","password":"s3cret!!","firstName":"Ada","lastName":"Lovelace"}'

# ...or log in to an existing account
curl -c jar -X POST localhost:8080/auth/login \
  -d '{"username":"ada","password":"s3cret!!"}'

# create an expense (reuse the cookie jar)
curl -b jar -X POST localhost:8080/expenses \
  -d '{"amount":12.5,"category":"food","description":"lunch","date":"2026-10-07"}'

# list your expenses
curl -b jar localhost:8080/expenses

# add income for a month, then list it
curl -b jar -X POST localhost:8080/income \
  -d '{"source":"salary","amount":3200,"month":"2026-10"}'
curl -b jar 'localhost:8080/income?month=2026-10'
```

## Tests

```bash
# fast unit tests (no database needed)
go test ./... -race

# integration tests against a real Postgres
docker compose up -d db
export TEST_DATABASE_URL="postgres://expense:expense@localhost:5432/expenses?sslmode=disable"
go test -tags=integration ./test/integration/...
```

## Features

- Multi-resource personal finance API: expenses, income, savings, investments, debts (one-time + installment plans), and a per-month budget sheet
- Cookie-based authentication: bcrypt password hashing, signed HttpOnly session cookies, and `RequireAuth` middleware — all data scoped per user
- A `Store` interface per domain so storage can be swapped without touching the handlers
- In-memory and PostgreSQL (`pgx`) storage backends, selected at startup
- `context.Context`-aware store methods and environment-based config (no hardcoded credentials)
- Unit tests (`httptest`, interface stubs) and integration tests (`-tags=integration`), `go vet` + `go test -race` clean
- Multi-stage `Dockerfile` (~20 MB distroless image) and full stack via `docker compose up --build`
- Graceful shutdown (SIGINT/SIGTERM), request logging middleware, and GitHub Actions CI
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS, with login/register, a sidebar workspace, and a page per resource
- Spending overview charts and inline row editing (e.g. editable debt rows with payment-progress tracking)
- Server-rendered initial data; create/update/delete handled client-side via a typed, reusable API client
- Same-origin `/api/*` proxy to the Go backend (no CORS) and `.env` auto-loading via `godotenv`

### Next up
- [ ] Filtering and sorting by category, date range, and amount
- [ ] Pagination for large lists (API + UI)
- [ ] Containerize the frontend and add it to `docker compose`
- [ ] End-to-end tests for the frontend (Playwright)
- [ ] Store money amounts as integer cents / `NUMERIC` to avoid float rounding
