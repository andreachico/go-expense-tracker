package expense

import (
	"errors"
	"testing"
)

// Go's testing works by convention: files end in _test.go, and functions named
// TestXxx(t *testing.T) are run by `go test`. t.Errorf records a failure but
// keeps going; t.Fatalf records a failure and stops the current test.

func TestMemoryStore_CreateAssignsIncrementingIDs(t *testing.T) {
	s := NewMemoryStore()

	first := s.Create(Expense{Amount: 10, Category: "food"})
	second := s.Create(Expense{Amount: 20, Category: "transport"})

	if first.ID != 1 {
		t.Errorf("first ID = %d, want 1", first.ID)
	}
	if second.ID != 2 {
		t.Errorf("second ID = %d, want 2", second.ID)
	}
}

func TestMemoryStore_GetReturnsStoredExpense(t *testing.T) {
	s := NewMemoryStore()
	created := s.Create(Expense{Amount: 10, Category: "food", Description: "lunch"})

	got, err := s.Get(created.ID)
	if err != nil {
		t.Fatalf("Get returned unexpected error: %v", err)
	}
	if got != created {
		t.Errorf("Get = %+v, want %+v", got, created)
	}
}

func TestMemoryStore_GetMissingReturnsErrNotFound(t *testing.T) {
	s := NewMemoryStore()

	_, err := s.Get(999)

	// errors.Is is the right way to compare against a sentinel error; it also
	// works if the error has been wrapped with fmt.Errorf("...: %w", err).
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("Get error = %v, want ErrNotFound", err)
	}
}

func TestMemoryStore_UpdateKeepsID(t *testing.T) {
	s := NewMemoryStore()
	created := s.Create(Expense{Amount: 10, Category: "food"})

	updated, err := s.Update(created.ID, Expense{ID: 999, Amount: 15, Category: "food"})
	if err != nil {
		t.Fatalf("Update returned unexpected error: %v", err)
	}
	if updated.ID != created.ID {
		t.Errorf("updated ID = %d, want %d (ID from path must win)", updated.ID, created.ID)
	}
	if updated.Amount != 15 {
		t.Errorf("updated Amount = %v, want 15", updated.Amount)
	}
}

func TestMemoryStore_UpdateMissingReturnsErrNotFound(t *testing.T) {
	s := NewMemoryStore()

	_, err := s.Update(999, Expense{Amount: 1, Category: "food"})

	if !errors.Is(err, ErrNotFound) {
		t.Errorf("Update error = %v, want ErrNotFound", err)
	}
}

func TestMemoryStore_DeleteRemovesExpense(t *testing.T) {
	s := NewMemoryStore()
	created := s.Create(Expense{Amount: 10, Category: "food"})

	if err := s.Delete(created.ID); err != nil {
		t.Fatalf("Delete returned unexpected error: %v", err)
	}
	if _, err := s.Get(created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("after Delete, Get error = %v, want ErrNotFound", err)
	}
}

func TestMemoryStore_DeleteMissingReturnsErrNotFound(t *testing.T) {
	s := NewMemoryStore()

	if err := s.Delete(999); !errors.Is(err, ErrNotFound) {
		t.Errorf("Delete error = %v, want ErrNotFound", err)
	}
}

func TestMemoryStore_ListIsSortedByID(t *testing.T) {
	s := NewMemoryStore()
	s.Create(Expense{Amount: 1, Category: "a"}) // ID 1
	s.Create(Expense{Amount: 2, Category: "b"}) // ID 2
	s.Create(Expense{Amount: 3, Category: "c"}) // ID 3

	list := s.List()

	if len(list) != 3 {
		t.Fatalf("List len = %d, want 3", len(list))
	}
	for i, e := range list {
		if want := i + 1; e.ID != want {
			t.Errorf("list[%d].ID = %d, want %d", i, e.ID, want)
		}
	}
}

// Table-driven tests are idiomatic in Go: define a slice of cases and loop over
// them with t.Run so each case shows up as its own named subtest.
func TestExpense_Validate(t *testing.T) {
	cases := []struct {
		name    string
		input   Expense
		wantErr bool
	}{
		{"valid", Expense{Amount: 10, Category: "food"}, false},
		{"zero amount", Expense{Amount: 0, Category: "food"}, true},
		{"negative amount", Expense{Amount: -1, Category: "food"}, true},
		{"empty category", Expense{Amount: 10, Category: ""}, true},
		{"whitespace category", Expense{Amount: 10, Category: "   "}, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.input.Validate()
			if (err != nil) != tc.wantErr {
				t.Errorf("Validate() error = %v, wantErr = %v", err, tc.wantErr)
			}
		})
	}
}
