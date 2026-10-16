package savings

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

// Register attaches the savings routes to the given router.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /savings", h.list)
	mux.HandleFunc("POST /savings", h.create)
	mux.HandleFunc("DELETE /savings/{id}", h.delete)
}

// list returns the caller's savings for the "month" query param ("YYYY-MM").
func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	month := r.URL.Query().Get("month")
	if !monthPattern.MatchString(month) {
		writeError(w, http.StatusBadRequest, "month query param must be in YYYY-MM format")
		return
	}
	items, err := h.store.List(r.Context(), month)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var item Saving
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
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
		writeError(w, http.StatusNotFound, "savings entry not found")
		return
	}
	writeError(w, http.StatusInternalServerError, "internal server error")
}
