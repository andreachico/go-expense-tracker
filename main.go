package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/andreachico/go-expense-tracker/internal/expense"
	"github.com/joho/godotenv"
)

// main is the application's entry point. Its only job is "composition": create
// the pieces, wire them together, and start the server. Keeping main.go thin
// makes the real logic (in the expense package) easy to test on its own.
func main() {
	// Load a local .env file if present so `go run .` picks up DATABASE_URL
	// without manual exporting. Real environment variables always win, and a
	// missing file is not an error (production sets real env vars instead).
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Printf("could not load .env file: %v", err)
	}

	// A ServeMux is Go's HTTP request router: it matches incoming method+path
	// combinations to the right handler function.
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", healthHandler)

	// Pick the storage backend at startup. If DATABASE_URL is set we use
	// PostgreSQL; otherwise we fall back to the in-memory store. Because both
	// satisfy the expense.Store interface, the handler code is identical.
	store := newStore()
	expense.NewHandler(store).Register(mux)

	// If the store owns resources (the Postgres pool), close them on exit. The
	// interface assertion skips stores that have no Close method (MemoryStore).
	if closer, ok := store.(interface{ Close() }); ok {
		defer closer.Close()
	}

	srv := &http.Server{
		Addr:    ":8080",
		Handler: logging(mux), // wrap every request with the logging middleware.
		// A small header-read timeout protects against slow-loris style clients.
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Run the server in its own goroutine so main can wait for a shutdown signal.
	go func() {
		log.Printf("server running on http://localhost%s", srv.Addr)
		// ListenAndServe returns ErrServerClosed after a graceful Shutdown; that
		// is expected, so we only treat other errors as fatal.
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Block until the process receives Ctrl-C (SIGINT) or a SIGTERM (what Docker
	// sends on `docker stop`). signal.NotifyContext cancels ctx on either.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	log.Println("shutting down...")

	// Give in-flight requests up to 10 seconds to finish before forcing exit.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("server stopped")
}

// logging is HTTP middleware: it wraps a handler and records the method, path,
// response status, and how long the request took. Middleware is just a function
// that takes a handler and returns a new handler with extra behaviour around it.
func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d %s", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}

// statusRecorder wraps http.ResponseWriter so the middleware can see which
// status code the handler wrote (the ResponseWriter interface doesn't expose it).
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
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
