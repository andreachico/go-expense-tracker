package expense

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore is a Store backed by a PostgreSQL database. It implements the
// exact same five methods as MemoryStore, so the HTTP handlers work with either
// one — that's the whole point of programming against the Store interface.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore opens a connection pool to PostgreSQL and verifies it with a
// Ping before returning. A *pool* (not a single connection) lets the server
// handle many concurrent requests efficiently.
//
// connString looks like: postgres://user:password@host:5432/dbname
func NewPostgresStore(ctx context.Context, connString string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		// %w "wraps" the underlying error so callers can still inspect it with
		// errors.Is / errors.As while we add context to the message.
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

// List returns every expense ordered by ID.
func (s *PostgresStore) List(ctx context.Context) ([]Expense, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, amount, category, description, date FROM expenses ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("querying expenses: %w", err)
	}
	defer rows.Close() // always close rows to return the connection to the pool.

	list := make([]Expense, 0)
	for rows.Next() {
		e, err := scanExpense(rows)
		if err != nil {
			return nil, fmt.Errorf("scanning expense: %w", err)
		}
		list = append(list, e)
	}
	return list, rows.Err() // rows.Err reports errors that ended iteration early.
}

// Get loads one expense by ID, translating "no such row" into our own
// ErrNotFound so the handlers don't need to know about pgx internals.
func (s *PostgresStore) Get(ctx context.Context, id int) (Expense, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, amount, category, description, date FROM expenses WHERE id = $1`, id)

	e, err := scanExpense(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Expense{}, ErrNotFound
	}
	if err != nil {
		return Expense{}, fmt.Errorf("querying expense: %w", err)
	}
	return e, nil
}

// Create inserts a new row and lets PostgreSQL assign the ID via a sequence.
// RETURNING id gives us that generated value back in one round trip.
func (s *PostgresStore) Create(ctx context.Context, e Expense) (Expense, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO expenses (amount, category, description, date)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		e.Amount, e.Category, e.Description, e.Date,
	).Scan(&e.ID)
	if err != nil {
		return Expense{}, fmt.Errorf("inserting expense: %w", err)
	}
	return e, nil
}

// Update overwrites an existing row. RowsAffected() == 0 means nothing matched
// the ID, which we report as ErrNotFound.
func (s *PostgresStore) Update(ctx context.Context, id int, e Expense) (Expense, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE expenses SET amount = $1, category = $2, description = $3, date = $4
		 WHERE id = $5`,
		e.Amount, e.Category, e.Description, e.Date, id)
	if err != nil {
		return Expense{}, fmt.Errorf("updating expense: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return Expense{}, ErrNotFound
	}
	e.ID = id
	return e, nil
}

// Delete removes a row by ID.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM expenses WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("deleting expense: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// rowScanner is the one method both pgx.Row (single row) and pgx.Rows (a row in
// a loop) share, so a single scanExpense helper works for Get and List.
type rowScanner interface {
	Scan(dest ...any) error
}

// scanExpense reads one database row into an Expense. The date column is a SQL
// DATE, which pgx hands back as time.Time; we format it to the "YYYY-MM-DD"
// string the rest of the app uses.
func scanExpense(row rowScanner) (Expense, error) {
	var (
		e Expense
		d time.Time
	)
	if err := row.Scan(&e.ID, &e.Amount, &e.Category, &e.Description, &d); err != nil {
		return Expense{}, err
	}
	e.Date = d.Format("2006-01-02")
	return e, nil
}
