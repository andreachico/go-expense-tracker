package savings

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for savings records. The handlers
// depend on this interface so the in-memory and PostgreSQL implementations
// interchange.
type Store interface {
	List(ctx context.Context, month string) ([]Saving, error)
	Create(ctx context.Context, s Saving) (Saving, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore keeps savings in a map; data is lost when the program stops. A
// mutex guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Saving
	owner  map[int]int // savings ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory savings store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Saving),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns the caller's savings for a month, sorted by ID for stable output.
func (s *MemoryStore) List(ctx context.Context, month string) ([]Saving, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Saving, 0)
	for id, item := range s.items {
		if s.owner[id] == userID && item.Month == month {
			list = append(list, item)
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Saving) (Saving, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Delete removes one of the caller's savings rows by ID.
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
