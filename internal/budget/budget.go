// Package budget stores the user's monthly budget plan.
//
// Unlike expenses (many rows with their own IDs), the budget sheet is a single
// document: a flat map of "section:row" keys to planned entries, e.g.
// {"fix:miete": {Category: "Miete", Amount: 595}, "meta:paycheck": {Amount: 2555}}.
// Keeping it as one map keeps the store tiny while letting the frontend add,
// edit, and delete sections/rows freely.
package budget

// Entry is a single planned line item. Type/Category/Due carry the row's labels
// so user-added rows survive a round-trip; Amount is the planned value.
type Entry struct {
	Type     string  `json:"type"`
	Category string  `json:"category"`
	Amount   float64 `json:"amount"`
	Due      string  `json:"due,omitempty"`
}

// Plan is the entire budget sheet as a flat map of entry keys to entries.
type Plan map[string]Entry
