# go-expense-tracker

[![CI](https://github.com/andreachico/go-expense-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/andreachico/go-expense-tracker/actions/workflows/ci.yml)
![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

A RESTful expense tracker API built with Go, PostgreSQL, and Docker. A learning project focused on Go backend development, REST APIs, database integration, testing, and clean project structure.

## Architecture

HTTP requests flow through a router to handlers, which depend only on a `Store`
**interface** — so the same code runs against either the in-memory or the
PostgreSQL implementation, chosen at startup.

```mermaid
flowchart LR
    client[HTTP client] --> mux[ServeMux router]
    mux --> mw[logging middleware]
    mw --> handler[expense.Handler]
    handler -->|Store interface| iface{{Store}}
    iface --> mem[MemoryStore]
    iface --> pg[PostgresStore]
    pg --> db[(PostgreSQL)]
```

## Project layout

```
go-expense-tracker/
├── main.go                     # entry point: picks the store, wires routes, starts the server
├── Dockerfile                  # multi-stage build -> tiny distroless runtime image
├── .dockerignore               # keeps the Docker build context small
├── docker-compose.yml          # runs the full stack: app + PostgreSQL
├── db/
│   └── schema.sql              # expenses table, run on first DB startup
├── internal/
│   └── expense/
│       ├── expense.go          # the Expense model + validation rules
│       ├── store.go            # Store interface + in-memory implementation
│       ├── postgres.go         # PostgreSQL implementation of Store (pgx)
│       └── handler.go          # HTTP handlers (request -> Store call -> JSON response)
├── test/
│   └── integration/            # DB-backed tests (run with -tags=integration)
└── web/                        # Next.js frontend (App Router, TypeScript, Tailwind)
    └── src/
        ├── app/                # pages + UI (server + client components)
        └── lib/                # typed API client and server-side data loader
```

The handlers depend on the `Store` **interface**, not on a concrete database.
`MemoryStore` and `PostgresStore` both satisfy it, so the HTTP code is identical
no matter which backend is active.

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
so there's no CORS setup. Initial data is server-rendered; adding and deleting
expenses happens client-side.

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

| Method | Path             | Body (JSON)                             | Success |
|--------|------------------|-----------------------------------------|---------|
| GET    | `/health`        | –                                       | 200     |
| GET    | `/expenses`      | –                                       | 200     |
| POST   | `/expenses`      | `{amount, category, description, date}` | 201     |
| GET    | `/expenses/{id}` | –                                       | 200     |
| PUT    | `/expenses/{id}` | `{amount, category, description, date}` | 200     |
| DELETE | `/expenses/{id}` | –                                       | 204     |

Validation: `amount` must be greater than 0 and `category` is required;
otherwise the API responds `400` with `{"error": "..."}`.

### Examples

```bash
# create
curl -X POST localhost:8080/expenses \
  -d '{"amount":12.5,"category":"food","description":"lunch","date":"2026-10-07"}'

# list
curl localhost:8080/expenses

# get one
curl localhost:8080/expenses/1

# update
curl -X PUT localhost:8080/expenses/1 \
  -d '{"amount":15,"category":"food","description":"lunch updated","date":"2026-10-07"}'

# delete
curl -X DELETE localhost:8080/expenses/1
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

## Roadmap

### Phase 1 — Core API ✅
- [x] In-memory CRUD API
- [x] `Store` interface so storage can be swapped without touching handlers
- [x] Input validation + consistent JSON error responses

### Phase 2 — Testing ✅
- [x] Unit tests for the store (CRUD, `ErrNotFound`, sorted list, validation)
- [x] HTTP handler tests with `httptest` + interface-based stubbing
- [x] Passes `go vet` and `go test -race` (~90% coverage)

### Phase 3 — PostgreSQL storage ✅
- [x] `docker-compose.yml` with a Postgres service for local development
- [x] SQL schema for the `expenses` table (`db/schema.sql`)
- [x] `PostgresStore` implementing the `Store` interface (`pgx` driver)
- [x] `Store` interface evolved to take `context.Context` and return errors
- [x] Database config from environment variables (no hardcoded credentials)
- [x] Integration tests in `test/integration/` (run with `-tags=integration`)

### Phase 4 — Containerize ✅
- [x] Multi-stage `Dockerfile` producing a ~20 MB distroless image
- [x] App + database wired together via `docker compose up --build`

### Phase 5 — Production polish ✅
- [x] Graceful shutdown on SIGINT/SIGTERM (`http.Server.Shutdown`)
- [x] Request logging middleware (method, path, status, duration)
- [x] CI with GitHub Actions (`go vet`, `go test -race`)
