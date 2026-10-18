package budget

import (
	"encoding/json"
	"net/http"
	"regexp"
	"time"
)

// monthPattern matches a "YYYY-MM" month key.
var monthPattern = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

// monthParam returns the ?month=YYYY-MM query value, falling back to the current
// month when it's missing or malformed.
func monthParam(r *http.Request) string {
	month := r.URL.Query().Get("month")
	if monthPattern.MatchString(month) {
		return month
	}
	return time.Now().Format("2006-01")
}

// Handler exposes the budget plan over HTTP. It depends on the Store interface,
// so it works with either the in-memory or PostgreSQL implementation.
type Handler struct {
	store Store
}

// NewHandler builds a Handler around a Store.
func NewHandler(store Store) *Handler {
	return &Handler{store: store}
}

// Register wires the two budget routes onto the router: read a month's plan and
// replace a month's plan. The month is selected with a ?month=YYYY-MM query.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /budget", h.get)
	mux.HandleFunc("GET /budget/breakdown", h.breakdown)
	mux.HandleFunc("PUT /budget", h.save)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	plan, err := h.store.Get(r.Context(), monthParam(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

// breakdown returns each budget line's amount per month across all of the
// caller's months, keyed by entry key (e.g. "investments:ethereum").
func (h *Handler) breakdown(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.Breakdown(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, data)
}

func (h *Handler) save(w http.ResponseWriter, r *http.Request) {
	var plan Plan
	if err := json.NewDecoder(r.Body).Decode(&plan); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if err := h.store.Save(r.Context(), monthParam(r), plan); err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

// writeJSON encodes a value as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// writeError returns a consistent {"error": "..."} JSON shape.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
