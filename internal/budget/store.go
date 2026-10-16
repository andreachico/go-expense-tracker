package budget

import (
	"context"
	"sync"
)

// Store persists one budget plan per month (keyed "YYYY-MM"). Like
// expense.Store, the HTTP handlers depend on this interface, so the in-memory
// and PostgreSQL implementations are interchangeable.
type Store interface {
	Get(ctx context.Context, month string) (Plan, error)
	Save(ctx context.Context, month string, plan Plan) error
}

// MemoryStore keeps the plans in memory; data is lost when the program stops.
// A mutex guards the map because the server serves requests concurrently.
type MemoryStore struct {
	mu    sync.Mutex
	plans map[string]Plan // keyed by month "YYYY-MM"
}

// NewMemoryStore returns an empty, ready-to-use in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{plans: map[string]Plan{}}
}

// Get returns a copy of the given month's plan so callers can't mutate the
// internal map without going through Save.
func (s *MemoryStore) Get(_ context.Context, month string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.plans[month]
	out := make(Plan, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out, nil
}

// Save replaces the given month's plan with a copy of the provided map.
func (s *MemoryStore) Save(_ context.Context, month string, plan Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := make(Plan, len(plan))
	for k, v := range plan {
		cp[k] = v
	}
	s.plans[month] = cp
	return nil
}
