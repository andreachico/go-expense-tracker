package expense

import (
	"context"
	"sort"
	"sync"
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
	nextID int
}

// NewMemoryStore builds a ready-to-use store. Returning a pointer (*MemoryStore)
// means every caller shares the same underlying map and counter.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Expense),
		nextID: 1,
	}
}

// The ctx parameter is unused by the in-memory store (there's no slow I/O to
// cancel), but it's part of the Store interface so every implementation shares
// the same signature. The blank-looking `_ context.Context` documents that.

// List returns all expenses sorted by ID so the output is stable (map iteration
// order in Go is deliberately random).
func (s *MemoryStore) List(_ context.Context) ([]Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock() // defer runs this when the function returns, even on panic.

	list := make([]Expense, 0, len(s.items))
	for _, e := range s.items {
		list = append(list, e)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list, nil
}

// Get returns one expense, or ErrNotFound if the ID is unknown.
// The comma-ok form `v, ok := m[key]` is how you test map membership in Go.
func (s *MemoryStore) Get(_ context.Context, id int) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, ok := s.items[id]
	if !ok {
		return Expense{}, ErrNotFound
	}
	return e, nil
}

// Create assigns the next ID, stores the expense, and returns the stored copy.
func (s *MemoryStore) Create(_ context.Context, e Expense) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e.ID = s.nextID
	s.nextID++
	s.items[e.ID] = e
	return e, nil
}

// Update replaces an existing expense, keeping its original ID.
func (s *MemoryStore) Update(_ context.Context, id int, e Expense) (Expense, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.items[id]; !ok {
		return Expense{}, ErrNotFound
	}
	e.ID = id
	s.items[id] = e
	return e, nil
}

// Delete removes an expense by ID.
func (s *MemoryStore) Delete(_ context.Context, id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.items[id]; !ok {
		return ErrNotFound
	}
	delete(s.items, id)
	return nil
}
