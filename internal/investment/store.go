package investment

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for investment sales. The handlers
// depend on this interface so the in-memory and PostgreSQL implementations
// interchange.
type Store interface {
	List(ctx context.Context) ([]Sale, error)
	Create(ctx context.Context, s Sale) (Sale, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore keeps sales in a map; data is lost when the program stops. A mutex
// guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Sale
	owner  map[int]int // sale ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory sales store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Sale),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns all of the caller's sales, newest month first.
func (s *MemoryStore) List(ctx context.Context) ([]Sale, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Sale, 0)
	for id, item := range s.items {
		if s.owner[id] == userID {
			list = append(list, item)
		}
	}
	sort.Slice(list, func(a, b int) bool {
		if list[a].Month != list[b].Month {
			return list[a].Month > list[b].Month
		}
		return list[a].ID > list[b].ID
	})
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Sale) (Sale, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Delete removes one of the caller's sale rows by ID.
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
