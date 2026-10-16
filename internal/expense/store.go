package expense

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations the rest of the app needs.
//
// This is the most important design choice in the project. The HTTP handlers
// depend on this INTERFACE, not on any concrete database. The in-memory and
// PostgreSQL implementations both satisfy it, so the handlers never change.
//
// Every method takes a context.Context and can return an error. The in-memory
// store never really fails, but a database can (dropped connection, timeout,
// cancelled request), so the interface must allow for it. context lets a
// caller cancel a slow query — e.g. when the HTTP client disconnects.
type Store interface {
	List(ctx context.Context) ([]Expense, error)
	Get(ctx context.Context, id int) (Expense, error)
	Create(ctx context.Context, e Expense) (Expense, error)
	Update(ctx context.Context, id int, e Expense) (Expense, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore is an in-memory implementation of Store. It keeps everything in
// a map, so data is lost when the program stops. That's fine for learning and
// tests; we swap it for a database later.
//
// A web server handles many requests concurrently (each in its own goroutine),
// and maps are NOT safe for concurrent use. The sync.Mutex guards the map so
// only one goroutine touches it at a time.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Expense
	owner  map[int]int // expense ID -> owning user ID
	nextID int
}

// NewMemoryStore builds a ready-to-use store. Returning a pointer (*MemoryStore)
// means every caller shares the same underlying map and counter.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Expense),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// Every method scopes its work to the user ID carried on the context (set by the
// auth middleware), so one account never sees another's expenses.

// List returns the caller's expenses sorted by ID so the output is stable (map
// iteration order in Go is deliberately random).
func (s *MemoryStore) List(ctx context.Context) ([]Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock() // defer runs this when the function returns, even on panic.

	userID := auth.UserID(ctx)
	list := make([]Expense, 0, len(s.items))
	for id, e := range s.items {
		if s.owner[id] == userID {
			list = append(list, e)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list, nil
}

// Get returns one of the caller's expenses, or ErrNotFound if the ID is unknown
// or owned by another user (so existence isn't leaked across accounts).
func (s *MemoryStore) Get(ctx context.Context, id int) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return Expense{}, ErrNotFound
	}
	return e, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, e Expense) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e.ID = s.nextID
	s.nextID++
	s.items[e.ID] = e
	s.owner[e.ID] = auth.UserID(ctx)
	return e, nil
}

// Update replaces one of the caller's expenses, keeping its original ID.
func (s *MemoryStore) Update(ctx context.Context, id int, e Expense) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.items[id]; !ok || s.owner[id] != auth.UserID(ctx) {
		return Expense{}, ErrNotFound
	}
	e.ID = id
	s.items[id] = e
	return e, nil
}

// Delete removes one of the caller's expenses by ID.
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
