package income

import (
	"context"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists income in the "income" table. It implements the same
// Store interface as MemoryStore, so the handlers work with either.
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

// List returns the caller's income for a month, ordered by ID.
func (s *PostgresStore) List(ctx context.Context, month string) ([]Income, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, source, amount, month FROM income WHERE user_id = $1 AND month = $2 ORDER BY id`,
		auth.UserID(ctx), month)
	if err != nil {
		return nil, fmt.Errorf("querying income: %w", err)
	}
	defer rows.Close()

	list := make([]Income, 0)
	for rows.Next() {
		var i Income
		if err := rows.Scan(&i.ID, &i.Source, &i.Amount, &i.Month); err != nil {
			return nil, fmt.Errorf("scanning income: %w", err)
		}
		list = append(list, i)
	}
	return list, rows.Err()
}

// Create inserts a new row owned by the caller and returns it with its new ID.
func (s *PostgresStore) Create(ctx context.Context, i Income) (Income, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO income (source, amount, month, user_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		i.Source, i.Amount, i.Month, auth.UserID(ctx),
	).Scan(&i.ID)
	if err != nil {
		return Income{}, fmt.Errorf("inserting income: %w", err)
	}
	return i, nil
}

// Delete removes one of the caller's rows by ID.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM income WHERE id = $1 AND user_id = $2`, id, auth.UserID(ctx))
	if err != nil {
		return fmt.Errorf("deleting income: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
