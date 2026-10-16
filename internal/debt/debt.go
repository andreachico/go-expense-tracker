// Package debt tracks installment plans (Ratenzahlungen): things you bought on
// credit and pay off in fixed monthly rates, e.g. a Macbook over 36 months. It
// mirrors the income package's design — a data model, a storage interface with
// in-memory and PostgreSQL implementations, and HTTP handlers — so the whole app
// stays consistent.
package debt

import (
	"errors"
	"regexp"
	"strings"
)

// Debt is a single debt. There are two kinds:
//   - KindOneTime: a single payment of the full amount, due in one month.
//   - KindInstallment: an installment plan (Ratenzahlung), e.g. a Macbook paid
//     off over 36 months.
//
// Both share the same fields; a one-time debt is simply a plan with TermMonths=1
// and MonthlyRate equal to the total. The payment schedule (per-month "left to
// pay" / "paid amount" / status) is derived from these fields by the frontend;
// PaidMonths is how many installments have been paid so far, counted from the
// start month.
type Debt struct {
	ID          int     `json:"id"`
	Kind        string  `json:"kind"`        // "onetime" or "installment"
	Name        string  `json:"name"`        //
	TotalAmount float64 `json:"totalAmount"` // original amount owed, e.g. 1945
	MonthlyRate float64 `json:"monthlyRate"` // fixed monthly payment, e.g. 54
	TermMonths  int     `json:"termMonths"`  // number of installments, e.g. 36
	StartMonth  string  `json:"startMonth"`  // "YYYY-MM" of the first installment
	PaidMonths  int     `json:"paidMonths"`  // installments already paid (from start)
}

// Debt kinds.
const (
	KindOneTime     = "onetime"
	KindInstallment = "installment"
)

// ErrNotFound is returned when a debt row doesn't exist (or isn't the caller's).
var ErrNotFound = errors.New("debt not found")

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// Normalize fills in derived fields for one-time debts: a single payment of the
// full amount, due in its start month.
func (d *Debt) Normalize() {
	if d.Kind == KindOneTime {
		d.TermMonths = 1
		d.MonthlyRate = d.TotalAmount
	}
}

// Validate reports whether the debt is well-formed before storing it.
func (d Debt) Validate() error {
	if d.Kind != KindOneTime && d.Kind != KindInstallment {
		return errors.New("kind must be onetime or installment")
	}
	if strings.TrimSpace(d.Name) == "" {
		return errors.New("name is required")
	}
	if d.TotalAmount <= 0 {
		return errors.New("total amount must be greater than zero")
	}
	if d.MonthlyRate <= 0 {
		return errors.New("monthly rate must be greater than zero")
	}
	if d.TermMonths <= 0 {
		return errors.New("term must be at least one month")
	}
	if !monthPattern.MatchString(d.StartMonth) {
		return errors.New("start month must be in YYYY-MM format")
	}
	if d.PaidMonths < 0 || d.PaidMonths > d.TermMonths {
		return errors.New("paid months must be between zero and the term length")
	}
	return nil
}
