package debt

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
)

// Handler bundles the dependencies the HTTP handlers need (just a Store).
type Handler struct {
	store Store
}

// NewHandler returns a Handler wired to the given Store.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register attaches the debt routes to the given router.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /debts", h.list)
	mux.HandleFunc("GET /debts/{id}", h.get)
	mux.HandleFunc("POST /debts", h.create)
	mux.HandleFunc("PUT /debts/{id}", h.update)
	mux.HandleFunc("PATCH /debts/{id}", h.updatePaid)
	mux.HandleFunc("DELETE /debts/{id}", h.delete)
}

// list returns all of the caller's installment plans.
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	items, err := h.store.List(r.Context())
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// get returns a single installment plan by ID.
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	item, err := h.store.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, item)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var item Debt
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	item.Normalize()
	if err := item.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := h.store.Create(r.Context(), item)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

// update changes the editable fields of a debt (its kind is preserved).
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	current, err := h.store.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var item Debt
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	// The kind is immutable; carry it over from the stored record so a one-time
	// debt stays one-time (and gets its derived fields) regardless of the body.
	item.Kind = current.Kind
	item.Normalize()
	if err := item.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	updated, err := h.store.Update(r.Context(), id, item)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// updatePaid sets how many installments of a plan have been paid.
func (h *Handler) updatePaid(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	var body struct {
		PaidMonths int `json:"paidMonths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.PaidMonths < 0 {
		writeError(w, http.StatusBadRequest, "paid months cannot be negative")
		return
	}
	current, err := h.store.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if body.PaidMonths > current.TermMonths {
		writeError(w, http.StatusBadRequest, "paid months cannot exceed the term length")
		return
	}
	updated, err := h.store.UpdatePaid(r.Context(), id, body.PaidMonths)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "id must be a number")
		return
	}
	if err := h.store.Delete(r.Context(), id); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- small helpers ---

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrNotFound) {
		writeError(w, http.StatusNotFound, "debt not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal server error")
}
