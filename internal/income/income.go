// Package income tracks money coming in: salary, side-jobs, and any other
// source, grouped by month. It mirrors the expense package's design — a data
// model, a storage interface with in-memory and PostgreSQL implementations, and
// HTTP handlers — so the whole app stays consistent.
package income

import (
	"errors"
	"regexp"
	"strings"
)

// Income is a single source of money received in a given month, e.g.
// {Source: "Corporate salary", Amount: 2555, Month: "2026-10"}.
type Income struct {
	ID     int     `json:"id"`
	Source string  `json:"source"`
	Amount float64 `json:"amount"`
	Month  string  `json:"month"` // "YYYY-MM"
}

// ErrNotFound is returned when an income row doesn't exist (or isn't the
// caller's).
var ErrNotFound = errors.New("income not found")

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Validate reports whether the income record is well-formed before storing it.
func (i Income) Validate() error {
	if i.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if strings.TrimSpace(i.Source) == "" {
		return errors.New("source is required")
	}
	if !monthPattern.MatchString(i.Month) {
		return errors.New("month must be in YYYY-MM format")
	}
	return nil
}
