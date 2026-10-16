// Package savings tracks money set aside: savings accounts, pots, or goals,
// grouped by month. It mirrors the income package's design — a data model, a
// storage interface with in-memory and PostgreSQL implementations, and HTTP
// handlers — so the whole app stays consistent.
package savings

import (
	"errors"
	"regexp"
	"strings"
)

// Saving is a single savings entry for a given month, e.g.
// {Name: "Emergency Fund", Amount: 500, Month: "2026-10"}.
type Saving struct {
	ID     int     `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Month  string  `json:"month"` // "YYYY-MM"
}

// ErrNotFound is returned when a savings row doesn't exist (or isn't the
// caller's).
var ErrNotFound = errors.New("savings entry not found")

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Validate reports whether the savings record is well-formed before storing it.
func (s Saving) Validate() error {
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
