package expense

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestServer builds a handler backed by a real in-memory store and returns a
// ready-to-use mux. httptest lets us exercise handlers without opening a real
// network port: we hand them a recorded request and inspect the response.
func newTestServer() *http.ServeMux {
	mux := http.NewServeMux()
	NewHandler(NewMemoryStore()).Register(mux)
	return mux
}

// do is a tiny helper that builds a request, runs it through the mux, and
// returns the recorder so tests can assert on status and body.
func do(t *testing.T, mux *http.ServeMux, method, path, body string) *httptest.ResponseRecorder {
	t.Helper() // marks this as a helper so failures point at the caller's line.
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestCreate_Valid(t *testing.T) {
	mux := newTestServer()

	rec := do(t, mux, http.MethodPost, "/expenses",
		`{"amount":12.5,"category":"food","description":"lunch","date":"2026-10-07"}`)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusCreated)
	}

	var got Expense
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.ID == 0 {
		t.Error("expected server to assign a non-zero ID")
	}
	if got.Amount != 12.5 || got.Category != "food" {
		t.Errorf("got %+v, want amount 12.5 / category food", got)
	}
}

func TestCreate_InvalidJSON(t *testing.T) {
	mux := newTestServer()

	rec := do(t, mux, http.MethodPost, "/expenses", `{not json`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestCreate_FailsValidation(t *testing.T) {
	mux := newTestServer()

	rec := do(t, mux, http.MethodPost, "/expenses", `{"amount":-5,"category":""}`)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestGet_NotFound(t *testing.T) {
	mux := newTestServer()

	rec := do(t, mux, http.MethodGet, "/expenses/999", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestGet_InvalidID(t *testing.T) {
	mux := newTestServer()

	rec := do(t, mux, http.MethodGet, "/expenses/abc", "")

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

// This test walks the full lifecycle through the HTTP layer: create, read,
// update, delete — proving the routes are wired correctly end to end.
func TestExpense_Lifecycle(t *testing.T) {
	mux := newTestServer()

	// Create
	rec := do(t, mux, http.MethodPost, "/expenses",
		`{"amount":10,"category":"food","description":"lunch","date":"2026-10-07"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", rec.Code, http.StatusCreated)
	}
	var created Expense
	json.NewDecoder(rec.Body).Decode(&created)

	// Get
	rec = do(t, mux, http.MethodGet, "/expenses/1", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("get status = %d, want %d", rec.Code, http.StatusOK)
	}

	// Update
	rec = do(t, mux, http.MethodPut, "/expenses/1",
		`{"amount":15,"category":"food","description":"lunch updated","date":"2026-10-07"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update status = %d, want %d", rec.Code, http.StatusOK)
	}
	var updated Expense
	json.NewDecoder(rec.Body).Decode(&updated)
	if updated.Amount != 15 {
		t.Errorf("updated amount = %v, want 15", updated.Amount)
	}

	// Delete
	rec = do(t, mux, http.MethodDelete, "/expenses/1", "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, want %d", rec.Code, http.StatusNoContent)
	}

	// Confirm it's gone
	rec = do(t, mux, http.MethodGet, "/expenses/1", "")
	if rec.Code != http.StatusNotFound {
		t.Errorf("after delete, get status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// --- Demonstrating the interface payoff ---
//
// Because Handler depends on the Store INTERFACE, a test can inject a fake that
// behaves however it likes — here, one whose Get always fails — without any
// database. This is how you'd simulate error paths once a real DB exists.

type stubStore struct {
	Store // embeds the interface so we only override the method we care about.
	err   error
}

func (s stubStore) Get(_ context.Context, id int) (Expense, error) { return Expense{}, s.err }

func TestGet_UsesStoreError(t *testing.T) {
	mux := http.NewServeMux()
	NewHandler(stubStore{err: ErrNotFound}).Register(mux)

	rec := do(t, mux, http.MethodGet, "/expenses/1", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
	if !strings.Contains(rec.Body.String(), "not found") {
		t.Errorf("body = %q, want it to mention 'not found'", rec.Body.String())
	}
}
