package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/andreachico/go-expense-tracker/internal/expense"
)

// main is the application's entry point. Its only job is "composition": create
// the pieces, wire them together, and start the server. Keeping main.go thin
// makes the real logic (in the expense package) easy to test on its own.
func main() {
	// A ServeMux is Go's HTTP request router: it matches incoming method+path
	// combinations to the right handler function.
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler)

	// Pick the storage backend at startup. If DATABASE_URL is set we use
	// PostgreSQL; otherwise we fall back to the in-memory store. Because both
	// satisfy the expense.Store interface, the handler code is identical.
	store := newStore()
	expense.NewHandler(store).Register(mux)

	const addr = ":8080"
	log.Printf("server running on http://localhost%s", addr)

	// ListenAndServe blocks until the server stops. It only returns on error,
	// and log.Fatal prints that error and exits with a non-zero status code.
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// newStore returns a PostgreSQL-backed store when DATABASE_URL is configured,
// and an in-memory store otherwise. Reading config from the environment (never
// hardcoding credentials) is the standard way to configure a server.
func newStore() expense.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory store")
		return expense.NewMemoryStore()
	}

	store, err := expense.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	log.Println("connected to PostgreSQL")
	return store
}

// healthHandler reports that the service is up. Load balancers and monitoring
// tools hit endpoints like this to decide if the app is healthy.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
