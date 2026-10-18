package budget

import (
	"context"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists the budget plan in a key/value table. It implements the
// same Store interface as MemoryStore, so the handlers work with either.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore opens a connection pool and verifies it with a Ping.
func NewPostgresStore(ctx context.Context, connString string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("connecting to postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging postgres: %w", err)
	}
	return &PostgresStore{pool: pool}, nil
}

// Close releases every connection in the pool. Call it on shutdown.
func (s *PostgresStore) Close() { s.pool.Close() }

// Get loads a month's entries into a Plan map, scoped to the caller.
func (s *PostgresStore) Get(ctx context.Context, month string) (Plan, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT entry_key, type, category, amount, due FROM budget_amounts WHERE user_id = $1 AND month = $2`,
		auth.UserID(ctx), month)
	if err != nil {
		return nil, fmt.Errorf("querying budget: %w", err)
	}
	defer rows.Close()

	plan := make(Plan)
	for rows.Next() {
		var (
			key   string
			entry Entry
		)
		if err := rows.Scan(&key, &entry.Type, &entry.Category, &entry.Amount, &entry.Due); err != nil {
			return nil, fmt.Errorf("scanning budget row: %w", err)
		}
		plan[key] = entry
	}
	return plan, rows.Err()
}

// Save replaces a month's plan inside a transaction: clear that month's rows for
// this user, then insert the new entries. Wrapping both steps in a transaction
// means a failure leaves the previous plan intact rather than a half-written one.
func (s *PostgresStore) Save(ctx context.Context, month string, plan Plan) error {
	userID := auth.UserID(ctx)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) // no-op once the transaction is committed.

	if _, err := tx.Exec(ctx,
		`DELETE FROM budget_amounts WHERE user_id = $1 AND month = $2`, userID, month); err != nil {
		return fmt.Errorf("clearing budget: %w", err)
	}
	for key, entry := range plan {
		if _, err := tx.Exec(ctx,
			`INSERT INTO budget_amounts (user_id, month, entry_key, type, category, amount, due) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			userID, month, key, entry.Type, entry.Category, entry.Amount, entry.Due); err != nil {
			return fmt.Errorf("inserting budget entry: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// Breakdown returns each entry's amount per month across all of the caller's
// saved months: entryKey -> (month -> amount).
func (s *PostgresStore) Breakdown(ctx context.Context) (map[string]map[string]float64, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT entry_key, month, SUM(amount) FROM budget_amounts WHERE user_id = $1 GROUP BY entry_key, month`,
		auth.UserID(ctx))
	if err != nil {
		return nil, fmt.Errorf("querying budget breakdown: %w", err)
	}
	defer rows.Close()

	out := make(map[string]map[string]float64)
	for rows.Next() {
		var (
			key   string
			month string
			sum   float64
		)
		if err := rows.Scan(&key, &month, &sum); err != nil {
			return nil, fmt.Errorf("scanning budget breakdown: %w", err)
		}
		if out[key] == nil {
			out[key] = make(map[string]float64)
		}
		out[key][month] = sum
	}
	return out, rows.Err()
}
