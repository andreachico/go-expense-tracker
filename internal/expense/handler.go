package expense

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// Handler bundles the dependencies the HTTP handlers need. Right now that's
// just a Store. Storing dependencies on a struct (instead of using globals)
// keeps the code testable: a test can pass in a fake Store.
type Handler struct {
	store Store
}

// NewHandler is a constructor. Go has no classes; a function that returns a
// configured struct is the idiomatic equivalent.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register attaches every expense route to the given router (mux).
//
// The "GET /expenses/{id}" syntax is the method + wildcard routing built into
// Go's standard library since 1.22 — no third-party router needed. The {id}
// part is captured and read later via r.PathValue("id").
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /expenses", h.list)
	mux.HandleFunc("POST /expenses", h.create)
	mux.HandleFunc("GET /expenses/{id}", h.get)
	mux.HandleFunc("PUT /expenses/{id}", h.update)
	mux.HandleFunc("DELETE /expenses/{id}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.List())
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	e, ok := decodeExpense(w, r)
	if !ok {
		return
	}
	if err := e.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, h.store.Create(e))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := idFromPath(w, r)
	if !ok {
		return
	}
	e, err := h.store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := idFromPath(w, r)
	if !ok {
		return
	}
	e, ok := decodeExpense(w, r)
	if !ok {
		return
	}
	if err := e.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.store.Update(id, e)
	if err != nil {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idFromPath(w, r)
	if !ok {
		return
	}
	if err := h.store.Delete(id); err != nil {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}
	w.WriteHeader(http.StatusNoContent) // 204: success with no body.
}

// --- small helpers shared by the handlers above ---

// decodeExpense reads the JSON request body into an Expense. It returns
// ok=false (and already wrote an error response) when the body is invalid, so
// callers just `return` on failure.
func decodeExpense(w http.ResponseWriter, r *http.Request) (Expense, bool) {
	var e Expense
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return Expense{}, false
	}
	return e, true
}

// idFromPath extracts and parses the {id} path segment.
func idFromPath(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return 0, false
	}
	return id, true
}

// writeJSON is the single place that encodes a value as JSON and sets the
// status code and Content-Type header. Centralizing this avoids repetition.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// writeError returns a consistent JSON error shape: {"error": "..."}.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
