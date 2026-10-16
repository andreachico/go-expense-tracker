package budget

import (
	"context"
	"fmt"

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

// Get loads a month's entries into a Plan map.
func (s *PostgresStore) Get(ctx context.Context, month string) (Plan, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT entry_key, type, category, amount, due FROM budget_amounts WHERE month = $1`,
		month)
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

// Save replaces a month's plan inside a transaction: clear that month's rows,
// then insert the new entries. Wrapping both steps in a transaction means a
// failure leaves the previous plan intact rather than a half-written one.
func (s *PostgresStore) Save(ctx context.Context, month string, plan Plan) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) // no-op once the transaction is committed.

	if _, err := tx.Exec(ctx, `DELETE FROM budget_amounts WHERE month = $1`, month); err != nil {
		return fmt.Errorf("clearing budget: %w", err)
	}
	for key, entry := range plan {
		if _, err := tx.Exec(ctx,
			`INSERT INTO budget_amounts (month, entry_key, type, category, amount, due) VALUES ($1, $2, $3, $4, $5, $6)`,
			month, key, entry.Type, entry.Category, entry.Amount, entry.Due); err != nil {
			return fmt.Errorf("inserting budget entry: %w", err)
		}
	}
	return tx.Commit(ctx)
}
