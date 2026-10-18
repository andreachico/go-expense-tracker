package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/andreachico/go-expense-tracker/internal/budget"
	"github.com/andreachico/go-expense-tracker/internal/debt"
	"github.com/andreachico/go-expense-tracker/internal/expense"
	"github.com/andreachico/go-expense-tracker/internal/income"
	"github.com/andreachico/go-expense-tracker/internal/investment"
	"github.com/andreachico/go-expense-tracker/internal/savings"
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

	// Authentication: a user store plus the handler that issues and verifies
	// session cookies. The /auth/* routes (register, login, logout, me) stay
	// public so people can sign in.
	authStore := newAuthStore()
	if closer, ok := authStore.(interface{ Close() }); ok {
		defer closer.Close()
	}
	authHandler := auth.NewHandler(authStore, sessionSecret(), cookieSecure())
	authHandler.Register(mux)

	// Everything below is per-user and must be behind a login. We register these
	// routes on a separate mux and gate the whole thing with RequireAuth, which
	// rejects unauthenticated requests and injects the user ID into the context
	// so each store scopes its data to the logged-in account.
	protected := http.NewServeMux()

	// Pick the storage backend at startup. If DATABASE_URL is set we use
	// PostgreSQL; otherwise we fall back to the in-memory store. Because both
	// satisfy the expense.Store interface, the handler code is identical.
	store := newStore()
	expense.NewHandler(store).Register(protected)

	// If the store owns resources (the Postgres pool), close them on exit. The
	// interface assertion skips stores that have no Close method (MemoryStore).
	if closer, ok := store.(interface{ Close() }); ok {
		defer closer.Close()
	}

	// The budget sheet has its own store and routes, chosen the same way.
	budgetStore := newBudgetStore()
	budget.NewHandler(budgetStore).Register(protected)
	if closer, ok := budgetStore.(interface{ Close() }); ok {
		defer closer.Close()
	}

	// Income (salary, side-jobs, etc.) has its own store and routes too.
	incomeStore := newIncomeStore()
	income.NewHandler(incomeStore).Register(protected)
	if closer, ok := incomeStore.(interface{ Close() }); ok {
		defer closer.Close()
	}

	// Savings and debts each follow the same per-user pattern.
	savingsStore := newSavingsStore()
	savings.NewHandler(savingsStore).Register(protected)
	if closer, ok := savingsStore.(interface{ Close() }); ok {
		defer closer.Close()
	}

	// Investment sales (buys are planned in the budget sheet).
	investmentStore := newInvestmentStore()
	investment.NewHandler(investmentStore).Register(protected)
	if closer, ok := investmentStore.(interface{ Close() }); ok {
		defer closer.Close()
	}

	debtStore := newDebtStore()
	debt.NewHandler(debtStore).Register(protected)
	if closer, ok := debtStore.(interface{ Close() }); ok {
		defer closer.Close()
	}

	// Any path not matched by /health or /auth/* falls through to here, so every
	// expense and budget route is protected by the auth middleware.
	mux.Handle("/", authHandler.RequireAuth(protected))

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

// newBudgetStore mirrors newStore for the budget plan: PostgreSQL when
// DATABASE_URL is set, in-memory otherwise.
func newBudgetStore() budget.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory budget store")
		return budget.NewMemoryStore()
	}

	store, err := budget.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// newIncomeStore mirrors newStore for income: PostgreSQL when DATABASE_URL is
// set, in-memory otherwise.
func newIncomeStore() income.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory income store")
		return income.NewMemoryStore()
	}

	store, err := income.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// newSavingsStore mirrors newStore for savings: PostgreSQL when DATABASE_URL is
// set, in-memory otherwise.
func newSavingsStore() savings.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory savings store")
		return savings.NewMemoryStore()
	}

	store, err := savings.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// newInvestmentStore mirrors newStore for investment sales: PostgreSQL when
// DATABASE_URL is set, in-memory otherwise.
func newInvestmentStore() investment.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory investment store")
		return investment.NewMemoryStore()
	}

	store, err := investment.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// newDebtStore mirrors newStore for debts: PostgreSQL when DATABASE_URL is set,
// in-memory otherwise.
func newDebtStore() debt.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory debt store")
		return debt.NewMemoryStore()
	}

	store, err := debt.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// newAuthStore mirrors newStore for user accounts: PostgreSQL when DATABASE_URL
// is set, in-memory otherwise.
func newAuthStore() auth.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL not set — using in-memory user store")
		return auth.NewMemoryStore()
	}

	store, err := auth.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		log.Fatalf("could not connect to database: %v", err)
	}
	return store
}

// sessionSecret returns the key used to sign session tokens. In production set
// SESSION_SECRET to a long random value so logins survive restarts and can't be
// forged. If it's unset we generate a random key and warn — handy for dev, but
// it means every restart logs everyone out.
func sessionSecret() []byte {
	if s := os.Getenv("SESSION_SECRET"); s != "" {
		return []byte(s)
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		log.Fatalf("could not generate session secret: %v", err)
	}
	log.Println("SESSION_SECRET not set — using a random key (sessions reset on restart)")
	return []byte(hex.EncodeToString(buf))
}

// cookieSecure reports whether the session cookie should be marked HTTPS-only.
// Defaults to false so cookies work over http://localhost in development; set
// COOKIE_SECURE=true when serving the app over HTTPS in production.
func cookieSecure() bool {
	return os.Getenv("COOKIE_SECURE") == "true"
}

// healthHandler reports that the service is up. Load balancers and monitoring
// tools hit endpoints like this to decide if the app is healthy.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
