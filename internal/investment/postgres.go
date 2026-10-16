package investment

import (
	"context"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists investments in the "investments" table. It implements
// the same Store interface as MemoryStore, so the handlers work with either.
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

// List returns the caller's investments for a month, ordered by ID.
func (s *PostgresStore) List(ctx context.Context, month string) ([]Investment, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, amount, month FROM investments WHERE user_id = $1 AND month = $2 ORDER BY id`,
		auth.UserID(ctx), month)
	if err != nil {
		return nil, fmt.Errorf("querying investments: %w", err)
	}
	defer rows.Close()

	list := make([]Investment, 0)
	for rows.Next() {
		var item Investment
		if err := rows.Scan(&item.ID, &item.Name, &item.Amount, &item.Month); err != nil {
			return nil, fmt.Errorf("scanning investments: %w", err)
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

// Create inserts a new row owned by the caller and returns it with its new ID.
func (s *PostgresStore) Create(ctx context.Context, item Investment) (Investment, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO investments (name, amount, month, user_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		item.Name, item.Amount, item.Month, auth.UserID(ctx),
	).Scan(&item.ID)
	if err != nil {
		return Investment{}, fmt.Errorf("inserting investment: %w", err)
	}
	return item, nil
}

// Delete removes one of the caller's rows by ID.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM investments WHERE id = $1 AND user_id = $2`, id, auth.UserID(ctx))
	if err != nil {
		return fmt.Errorf("deleting investment: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
