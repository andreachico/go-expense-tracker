package expense

import (
	"encoding/json"
	"errors"
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
	items, err := h.store.List(r.Context())
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
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
	created, err := h.store.Create(r.Context(), e)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := idFromPath(w, r)
	if !ok {
		return
	}
	e, err := h.store.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
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
	updated, err := h.store.Update(r.Context(), id, e)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idFromPath(w, r)
	if !ok {
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		writeStoreError(w, err)
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

// writeStoreError maps an error from the Store to an HTTP response: a missing
// record is a 404; anything else (e.g. a database failure) is a 500. We never
// leak the raw error to the client, which could expose internal details.
func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "expense not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal server error")
}
