package income

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for income records. The handlers depend
// on this interface so the in-memory and PostgreSQL implementations interchange.
type Store interface {
	List(ctx context.Context, month string) ([]Income, error)
	Create(ctx context.Context, i Income) (Income, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore keeps income in a map; data is lost when the program stops. A
// mutex guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Income
	owner  map[int]int // income ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory income store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Income),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns the caller's income for a month, sorted by ID for stable output.
func (s *MemoryStore) List(ctx context.Context, month string) ([]Income, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Income, 0)
	for id, i := range s.items {
		if s.owner[id] == userID && i.Month == month {
			list = append(list, i)
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, i Income) (Income, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	i.ID = s.nextID
	s.nextID++
	s.items[i.ID] = i
	s.owner[i.ID] = auth.UserID(ctx)
	return i, nil
}

// Delete removes one of the caller's income rows by ID.
func (s *MemoryStore) Delete(ctx context.Context, id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.items[id]; !ok || s.owner[id] != auth.UserID(ctx) {
		return ErrNotFound
	}
	delete(s.items, id)
	delete(s.owner, id)
	return nil
}
