package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

// cookieName is the name of the HttpOnly session cookie.
const cookieName = "session"

// Handler exposes the auth routes and the RequireAuth middleware. It holds the
// user Store, the secret used to sign session tokens, and whether cookies must
// be marked Secure (true in production over HTTPS, false for local HTTP dev).
type Handler struct {
	store  Store
	secret []byte
	secure bool
}

// NewHandler builds an auth Handler. secret signs session tokens; secure marks
// cookies HTTPS-only.
func NewHandler(store Store, secret []byte, secure bool) *Handler {
	return &Handler{store: store, secret: secret, secure: secure}
}

// Register wires the public auth routes. Login, register and logout are open;
// "me" verifies the cookie itself and returns 401 when not logged in.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/register", h.register)
	mux.HandleFunc("POST /auth/login", h.login)
	mux.HandleFunc("POST /auth/logout", h.logout)
	mux.HandleFunc("GET /auth/me", h.me)
}

// credentials is the JSON body for register and login. First and last name are
// only used on register.
type credentials struct {
	Username  string `json:"username"`
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	creds, ok := decodeCredentials(w, r)
	if !ok {
		return
	}
	creds.FirstName = strings.TrimSpace(creds.FirstName)
	creds.LastName = strings.TrimSpace(creds.LastName)
	creds.Email = strings.TrimSpace(creds.Email)

	if len(creds.Username) < 3 {
		writeError(w, http.StatusBadRequest, "username must be at least 3 characters")
		return
	}
	if !validEmail(creds.Email) {
		writeError(w, http.StatusBadRequest, "a valid email address is required")
		return
	}
	if creds.FirstName == "" || creds.LastName == "" {
		writeError(w, http.StatusBadRequest, "first and last name are required")
		return
	}
	if ok, reason := strongPassword(creds.Password); !ok {
		writeError(w, http.StatusBadRequest, reason)
		return
	}

	hash, err := hashPassword(creds.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	user, err := h.store.Create(r.Context(), creds.Username, creds.Email, hash, creds.FirstName, creds.LastName)
	if errors.Is(err, ErrUserExists) {
		writeError(w, http.StatusConflict, "username already taken")
		return
	}
	if errors.Is(err, ErrEmailExists) {
		writeError(w, http.StatusConflict, "email already in use")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.setSessionCookie(w, user.ID)
	writeJSON(w, http.StatusCreated, user)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	creds, ok := decodeCredentials(w, r)
	if !ok {
		return
	}

	user, err := h.store.GetByUsername(r.Context(), creds.Username)
	// Return the same error whether the username or the password was wrong, so
	// an attacker can't tell which usernames exist.
	if err != nil || !checkPassword(user.PasswordHash, creds.Password) {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	h.setSessionCookie(w, user.ID)
	writeJSON(w, http.StatusOK, user)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	// Overwrite the cookie with an expired one to clear it in the browser.
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	id, ok := h.userIDFromCookie(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	user, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

// RequireAuth is middleware that rejects requests without a valid session and,
// on success, injects the user's ID into the request context for downstream
// handlers and stores.
func (h *Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, ok := h.userIDFromCookie(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "not authenticated")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUserID(r.Context(), id)))
	})
}

// userIDFromCookie reads and verifies the session cookie.
func (h *Handler) userIDFromCookie(r *http.Request) (int, bool) {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return 0, false
	}
	return verifyToken(c.Value, h.secret)
}

// setSessionCookie signs a fresh token for userID and writes it as an HttpOnly
// cookie.
func (h *Handler) setSessionCookie(w http.ResponseWriter, userID int) {
	expiry := time.Now().Add(sessionTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    signToken(userID, expiry, h.secret),
		Path:     "/",
		HttpOnly: true,
		Secure:   h.secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiry,
	})
}

// decodeCredentials reads and trims the JSON credentials body.
func decodeCredentials(w http.ResponseWriter, r *http.Request) (credentials, bool) {
	var creds credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return credentials{}, false
	}
	creds.Username = strings.TrimSpace(creds.Username)
	return creds, true
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
