// Package investment tracks money invested: stocks, crypto, funds, and any
// other holding, grouped by month. It mirrors the income package's design — a
// data model, a storage interface with in-memory and PostgreSQL
// implementations, and HTTP handlers — so the whole app stays consistent.
package investment

import (
	"errors"
	"regexp"
	"strings"
)

// Investment is a single investment entry for a given month, e.g.
// {Name: "S&P 500", Amount: 300, Month: "2026-10"}.
type Investment struct {
	ID     int     `json:"id"`
	Name   string  `json:"name"`
	Amount float64 `json:"amount"`
	Month  string  `json:"month"` // "YYYY-MM"
}

// ErrNotFound is returned when an investment row doesn't exist (or isn't the
// caller's).
var ErrNotFound = errors.New("investment not found")

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Validate reports whether the investment record is well-formed before storing it.
func (i Investment) Validate() error {
	if i.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if strings.TrimSpace(i.Name) == "" {
		return errors.New("name is required")
	}
	if !monthPattern.MatchString(i.Month) {
		return errors.New("month must be in YYYY-MM format")
	}
	return nil
}
