//go:build integration

// Package integration holds tests that need real external services (here, a
// PostgreSQL database). They are separated from the fast unit tests by the
// "integration" build tag at the top of this file: a normal `go test ./...`
// skips them, and you run them explicitly with:
//
//	go test -tags=integration ./test/integration/...
//
// This is the idiomatic place for a top-level test/ folder — integration and
// end-to-end tests, not unit tests (those live beside the code they cover).
package integration

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/andreachico/go-expense-tracker/internal/expense"
)

// newStore connects to the database named by TEST_DATABASE_URL. If that env var
// is not set, the test is skipped rather than failed, so the suite stays green
// on machines without a database.
func newStore(t *testing.T) *expense.PostgresStore {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	store, err := expense.NewPostgresStore(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connecting to test database: %v", err)
	}
	t.Cleanup(store.Close) // close the pool when the test finishes.
	return store
}

func TestPostgresStore_Lifecycle(t *testing.T) {
	ctx := context.Background()
	store := newStore(t)

	// Create
	created, err := store.Create(ctx, expense.Expense{
		Amount:      12.5,
		Category:    "food",
		Description: "lunch",
		Date:        "2026-10-07",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == 0 {
		t.Fatal("expected a generated ID")
	}
	// Ensure we don't leave test data behind even if a later step fails.
	t.Cleanup(func() { _ = store.Delete(ctx, created.ID) })

	// Get
	got, err := store.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Amount != 12.5 || got.Category != "food" {
		t.Errorf("Get = %+v, want amount 12.5 / category food", got)
	}

	// Update
	updated, err := store.Update(ctx, created.ID, expense.Expense{
		Amount:      20,
		Category:    "food",
		Description: "dinner",
		Date:        "2026-10-07",
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Amount != 20 || updated.Description != "dinner" {
		t.Errorf("Update = %+v, want amount 20 / description dinner", updated)
	}

	// Delete
	if err := store.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Confirm it's gone
	if _, err := store.Get(ctx, created.ID); !errors.Is(err, expense.ErrNotFound) {
		t.Errorf("after Delete, Get error = %v, want ErrNotFound", err)
	}
}

func TestPostgresStore_GetMissingReturnsErrNotFound(t *testing.T) {
	store := newStore(t)

	_, err := store.Get(context.Background(), 999999)

	if !errors.Is(err, expense.ErrNotFound) {
		t.Errorf("Get error = %v, want ErrNotFound", err)
	}
}
