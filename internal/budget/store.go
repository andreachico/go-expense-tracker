package budget

import (
	"context"
	"fmt"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store persists one budget plan per month (keyed "YYYY-MM"). Like
// expense.Store, the HTTP handlers depend on this interface, so the in-memory
// and PostgreSQL implementations are interchangeable.
type Store interface {
	Get(ctx context.Context, month string) (Plan, error)
	Save(ctx context.Context, month string, plan Plan) error
}

// MemoryStore keeps the plans in memory; data is lost when the program stops.
// Plans are keyed by the owning user and month so accounts stay separate. A
// mutex guards the map because the server serves requests concurrently.
type MemoryStore struct {
	mu    sync.Mutex
	plans map[string]Plan // keyed by "userID:YYYY-MM"
}

// NewMemoryStore returns an empty, ready-to-use in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{plans: map[string]Plan{}}
}

// key scopes a month to the user on the context so one account never reads
// another's budget.
func key(ctx context.Context, month string) string {
	return fmt.Sprintf("%d:%s", auth.UserID(ctx), month)
}

// Get returns a copy of the given month's plan so callers can't mutate the
// internal map without going through Save.
func (s *MemoryStore) Get(ctx context.Context, month string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.plans[key(ctx, month)]
	out := make(Plan, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out, nil
}

// Save replaces the given month's plan with a copy of the provided map.
func (s *MemoryStore) Save(ctx context.Context, month string, plan Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := make(Plan, len(plan))
	for k, v := range plan {
		cp[k] = v
	}
	s.plans[key(ctx, month)] = cp
	return nil
}
