package debt

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for debt records. The handlers depend
// on this interface so the in-memory and PostgreSQL implementations interchange.
type Store interface {
	List(ctx context.Context) ([]Debt, error)
	Get(ctx context.Context, id int) (Debt, error)
	Create(ctx context.Context, d Debt) (Debt, error)
	Update(ctx context.Context, id int, d Debt) (Debt, error)
	UpdatePaid(ctx context.Context, id, paidMonths int) (Debt, error)
	Delete(ctx context.Context, id int) error
}

// MemoryStore keeps debts in a map; data is lost when the program stops. A mutex
// guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Debt
	owner  map[int]int // debt ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory debt store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Debt),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns all of the caller's installment plans, sorted by ID.
func (s *MemoryStore) List(ctx context.Context) ([]Debt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Debt, 0)
	for id, item := range s.items {
		if s.owner[id] == userID {
			list = append(list, item)
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
	return list, nil
}

// Get returns a single plan owned by the caller.
func (s *MemoryStore) Get(ctx context.Context, id int) (Debt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return Debt{}, ErrNotFound
	}
	return item, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Debt) (Debt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Update changes the editable fields of one of the caller's debts (kind and
// paid count are preserved) and returns the updated record.
func (s *MemoryStore) Update(ctx context.Context, id int, d Debt) (Debt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return Debt{}, ErrNotFound
	}
	item.Name = d.Name
	item.TotalAmount = d.TotalAmount
	item.MonthlyRate = d.MonthlyRate
	item.TermMonths = d.TermMonths
	item.StartMonth = d.StartMonth
	if item.PaidMonths > item.TermMonths {
		item.PaidMonths = item.TermMonths
	}
	s.items[id] = item
	return item, nil
}

// UpdatePaid sets how many installments have been paid on one of the caller's
// plans and returns the updated record.
func (s *MemoryStore) UpdatePaid(ctx context.Context, id, paidMonths int) (Debt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return Debt{}, ErrNotFound
	}
	item.PaidMonths = paidMonths
	s.items[id] = item
	return item, nil
}

// Delete removes one of the caller's debt rows by ID.
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
