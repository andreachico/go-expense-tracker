package investment

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for investment records. The handlers
// depend on this interface so the in-memory and PostgreSQL implementations
// interchange.
type Store interface {
	List(ctx context.Context, month string) ([]Investment, error)
	Create(ctx context.Context, i Investment) (Investment, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore keeps investments in a map; data is lost when the program stops. A
// mutex guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Investment
	owner  map[int]int // investment ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory investment store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Investment),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns the caller's investments for a month, sorted by ID.
func (s *MemoryStore) List(ctx context.Context, month string) ([]Investment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Investment, 0)
	for id, item := range s.items {
		if s.owner[id] == userID && item.Month == month {
			list = append(list, item)
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Investment) (Investment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Delete removes one of the caller's investment rows by ID.
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
