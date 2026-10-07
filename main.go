package main

import (
	"log"
	"net/http"

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

	// Build the store, then the handler that uses it, then register its routes.
	// Today store is in-memory; swapping to PostgreSQL later means changing only
	// this one line, because Handler depends on the Store interface.
	store := expense.NewMemoryStore()
	expense.NewHandler(store).Register(mux)

	const addr = ":8080"
	log.Printf("server running on http://localhost%s", addr)

	// ListenAndServe blocks until the server stops. It only returns on error,
	// and log.Fatal prints that error and exits with a non-zero status code.
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

// healthHandler reports that the service is up. Load balancers and monitoring
// tools hit endpoints like this to decide if the app is healthy.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
