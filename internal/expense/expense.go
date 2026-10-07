// Package expense contains everything related to an expense:
// the data model, its storage, and its HTTP handlers.
//
// Grouping related code into one package is idiomatic Go: a package is the
// unit of reuse and encapsulation. Anything starting with a capital letter
// (Expense, Validate) is "exported" and visible to other packages; lowercase
// names stay private to this package.
package expense

import (
	"errors"
	"strings"
)

// Expense is a single tracked spending record.
//
// The `json:"..."` tags tell the encoding/json package what key names to use
// when converting to/from JSON. Without them Go would use the Go field names.
type Expense struct {
	ID          int     `json:"id"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
}

// ErrNotFound is a sentinel error: a single shared value callers can compare
// against with errors.Is to detect "this expense doesn't exist" without
// matching on error text.
var ErrNotFound = errors.New("expense not found")

// Validate reports whether the expense is well-formed before we store it.
// Returning an error (rather than a bool) lets us explain *what* was wrong.
func (e Expense) Validate() error {
	if e.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if strings.TrimSpace(e.Category) == "" {
		return errors.New("category is required")
	}
	return nil
}
