package debt

import (
	"context"
	"errors"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists debts in the "debts" table. It implements the same
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

// List returns all of the caller's installment plans, ordered by ID.
func (s *PostgresStore) List(ctx context.Context) ([]Debt, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, kind, name, total_amount, monthly_rate, term_months, start_month, paid_months
		 FROM debts WHERE user_id = $1 ORDER BY id`,
		auth.UserID(ctx))
	if err != nil {
		return nil, fmt.Errorf("querying debts: %w", err)
	}
	defer rows.Close()

	list := make([]Debt, 0)
	for rows.Next() {
		var item Debt
		if err := rows.Scan(&item.ID, &item.Kind, &item.Name, &item.TotalAmount, &item.MonthlyRate,
			&item.TermMonths, &item.StartMonth, &item.PaidMonths); err != nil {
			return nil, fmt.Errorf("scanning debts: %w", err)
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

// Get returns a single plan owned by the caller.
func (s *PostgresStore) Get(ctx context.Context, id int) (Debt, error) {
	var item Debt
	err := s.pool.QueryRow(ctx,
		`SELECT id, kind, name, total_amount, monthly_rate, term_months, start_month, paid_months
		 FROM debts WHERE id = $1 AND user_id = $2`,
		id, auth.UserID(ctx),
	).Scan(&item.ID, &item.Kind, &item.Name, &item.TotalAmount, &item.MonthlyRate,
		&item.TermMonths, &item.StartMonth, &item.PaidMonths)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Debt{}, ErrNotFound
		}
		return Debt{}, fmt.Errorf("querying debt: %w", err)
	}
	return item, nil
}

// Create inserts a new plan owned by the caller and returns it with its new ID.
func (s *PostgresStore) Create(ctx context.Context, item Debt) (Debt, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO debts (kind, name, total_amount, monthly_rate, term_months, start_month, paid_months, user_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id`,
		item.Kind, item.Name, item.TotalAmount, item.MonthlyRate, item.TermMonths,
		item.StartMonth, item.PaidMonths, auth.UserID(ctx),
	).Scan(&item.ID)
	if err != nil {
		return Debt{}, fmt.Errorf("inserting debt: %w", err)
	}
	return item, nil
}

// Update changes the editable fields of one of the caller's debts (kind and
// paid count are preserved) and returns the updated record. The paid count is
// clamped to the new term length.
func (s *PostgresStore) Update(ctx context.Context, id int, d Debt) (Debt, error) {
	var item Debt
	err := s.pool.QueryRow(ctx,
		`UPDATE debts
		 SET name = $1, total_amount = $2, monthly_rate = $3, term_months = $4, start_month = $5,
		     paid_months = LEAST(paid_months, $4)
		 WHERE id = $6 AND user_id = $7
		 RETURNING id, kind, name, total_amount, monthly_rate, term_months, start_month, paid_months`,
		d.Name, d.TotalAmount, d.MonthlyRate, d.TermMonths, d.StartMonth, id, auth.UserID(ctx),
	).Scan(&item.ID, &item.Kind, &item.Name, &item.TotalAmount, &item.MonthlyRate,
		&item.TermMonths, &item.StartMonth, &item.PaidMonths)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Debt{}, ErrNotFound
		}
		return Debt{}, fmt.Errorf("updating debt: %w", err)
	}
	return item, nil
}

// UpdatePaid sets the paid installment count on one of the caller's plans.
func (s *PostgresStore) UpdatePaid(ctx context.Context, id, paidMonths int) (Debt, error) {
	var item Debt
	err := s.pool.QueryRow(ctx,
		`UPDATE debts SET paid_months = $1 WHERE id = $2 AND user_id = $3
		 RETURNING id, kind, name, total_amount, monthly_rate, term_months, start_month, paid_months`,
		paidMonths, id, auth.UserID(ctx),
	).Scan(&item.ID, &item.Kind, &item.Name, &item.TotalAmount, &item.MonthlyRate,
		&item.TermMonths, &item.StartMonth, &item.PaidMonths)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Debt{}, ErrNotFound
		}
		return Debt{}, fmt.Errorf("updating debt: %w", err)
	}
	return item, nil
}

// Delete removes one of the caller's rows by ID.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM debts WHERE id = $1 AND user_id = $2`, id, auth.UserID(ctx))
	if err != nil {
		return fmt.Errorf("deleting debt: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
