# go-expense-tracker
A RESTful expense tracker API built with Go, PostgreSQL, and Docker. A learning project focused on Go backend development, REST APIs, database integration, testing, and clean project structure.

## Project layout

```
go-expense-tracker/
├── main.go                     # entry point: wires everything together, starts the server
└── internal/
    └── expense/
        ├── expense.go          # the Expense model + validation rules
        ├── store.go            # Store interface + thread-safe in-memory implementation
        └── handler.go          # HTTP handlers (request -> Store call -> JSON response)
```

The handlers depend on the `Store` **interface**, not on a concrete database.
That is the seam that lets us later add a `PostgresStore` without touching the
HTTP code.

## Run it

```bash
go run .
# server running on http://localhost:8080
```

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

## Roadmap

- [x] In-memory CRUD API
- [ ] Unit tests (handlers with a fake Store, store behaviour)
- [ ] PostgreSQL-backed `Store` implementation
- [ ] Docker + docker-compose for app + database
