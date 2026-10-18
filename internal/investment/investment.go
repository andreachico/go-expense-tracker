// Package investment records sales of holdings — the times you cashed out part
// of an investment. Buys are planned in the budget sheet; a sale is subtracted
// from an asset's running total. It follows the same design as the other
// packages: a data model, a storage interface with in-memory and PostgreSQL
// implementations, and HTTP handlers.
package investment

import (
	"errors"
	"regexp"
	"strings"
)

// Sale is a single sell transaction for a holding in a given month, e.g.
// {Name: "Ethereum", Amount: 150, Month: "2026-10"}.
type Sale struct {
	ID     int     `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Month  string  `json:"month"` // "YYYY-MM"
}

// ErrNotFound is returned when a sale row doesn't exist (or isn't the caller's).
var ErrNotFound = errors.New("sale not found")

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Normalize tidies user input before validation and storage.
func (s *Sale) Normalize() { s.Name = strings.TrimSpace(s.Name) }

// Validate reports whether the sale record is well-formed before storing it.
func (s Sale) Validate() error {
	if s.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if strings.TrimSpace(s.Name) == "" {
		return errors.New("name is required")
	}
	if !monthPattern.MatchString(s.Month) {
		return errors.New("month must be in YYYY-MM format")
	}
	return nil
}
