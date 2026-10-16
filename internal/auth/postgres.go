package auth

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists users in the "users" table. It implements the same
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

// Create inserts a new user. A unique index on lower(username) turns a duplicate
// into ErrUserExists rather than a generic database error.
func (s *PostgresStore) Create(ctx context.Context, username, email, passwordHash, firstName, lastName string) (User, error) {
	u := User{Username: username, Email: email, FirstName: firstName, LastName: lastName, PasswordHash: passwordHash}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		username, email, passwordHash, firstName, lastName,
	).Scan(&u.ID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			if pgErr.ConstraintName == "users_email_lower_idx" {
				return User{}, ErrEmailExists
			}
			return User{}, ErrUserExists
		}
		return User{}, fmt.Errorf("inserting user: %w", err)
	}
	return u, nil
}

// GetByUsername looks up a user by their (case-insensitive) username.
func (s *PostgresStore) GetByUsername(ctx context.Context, username string) (User, error) {
	return s.scanUser(s.pool.QueryRow(ctx,
		`SELECT id, username, email, first_name, last_name, password_hash FROM users WHERE lower(username) = lower($1)`,
		username))
}

// GetByID looks up a user by their numeric ID.
func (s *PostgresStore) GetByID(ctx context.Context, id int) (User, error) {
	return s.scanUser(s.pool.QueryRow(ctx,
		`SELECT id, username, email, first_name, last_name, password_hash FROM users WHERE id = $1`, id))
}

// scanUser reads one row into a User, translating "no rows" into ErrUserNotFound.
func (s *PostgresStore) scanUser(row pgx.Row) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.Email, &u.FirstName, &u.LastName, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("querying user: %w", err)
	}
	return u, nil
}
