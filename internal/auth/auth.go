// Package auth adds user accounts and session-based login to the API. It keeps
// users in its own Store, hashes passwords with bcrypt, and issues a signed
// session token stored in an HttpOnly cookie. Other packages scope their data
// to the logged-in user by reading the user ID off the request context, which
// the RequireAuth middleware puts there.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

// User is an account. The password hash never leaves the server — it is omitted
// from JSON so it can't accidentally be sent to the browser.
type User struct {
	ID           int    `json:"id"`
	Username     string `json:"username"`
	Email        string `json:"email"`
	FirstName    string `json:"firstName"`
	LastName     string `json:"lastName"`
	PasswordHash string `json:"-"`
}

// contextKey is an unexported type so no other package can collide with our
// context key. This is the standard pattern for storing request-scoped values.
type contextKey struct{ name string }

var userIDKey = contextKey{"userID"}

// WithUserID returns a copy of ctx that carries the authenticated user's ID.
// The middleware calls this after verifying the session cookie.
func WithUserID(ctx context.Context, id int) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

// UserID reads the authenticated user's ID from the context, or 0 if none is
// set. The data stores use this to scope every query; because real user IDs
// start at 1, a missing ID (0) safely matches no data rather than leaking
// another user's records.
func UserID(ctx context.Context) int {
	id, _ := ctx.Value(userIDKey).(int)
	return id
}

// hashPassword turns a plaintext password into a bcrypt hash safe to store.
func hashPassword(plain string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hashing password: %w", err)
	}
	return string(h), nil
}

// checkPassword reports whether plain matches the stored bcrypt hash.
func checkPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// validEmail reports whether addr parses as a single, well-formed email address.
func validEmail(addr string) bool {
	parsed, err := mail.ParseAddress(addr)
	return err == nil && parsed.Address == addr
}

// strongPassword enforces a basic password-strength policy: at least 8
// characters including an uppercase letter, a lowercase letter, a digit, and a
// symbol. It returns a human-readable reason when the password is too weak.
func strongPassword(pw string) (ok bool, reason string) {
	if len(pw) < 8 {
		return false, "password must be at least 8 characters long"
	}
	var hasUpper, hasLower, hasDigit, hasSymbol bool
	for _, r := range pw {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSymbol = true
		}
	}
	if !hasUpper || !hasLower || !hasDigit || !hasSymbol {
		return false, "password must include an uppercase letter, a lowercase letter, a number, and a symbol"
	}
	return true, ""
}

// sessionTTL is how long a login lasts before the cookie expires.
const sessionTTL = 7 * 24 * time.Hour

// signToken builds a tamper-proof session token of the form
// "userID.expiryUnix.signature", where the signature is an HMAC-SHA256 of the
// first two fields keyed by the server secret. Without the secret an attacker
// can't forge or alter a token.
func signToken(userID int, expiry time.Time, secret []byte) string {
	payload := fmt.Sprintf("%d.%d", userID, expiry.Unix())
	return payload + "." + sign(payload, secret)
}

// verifyToken checks a token's signature and expiry and returns the user ID it
// encodes. ok is false for any malformed, altered, or expired token.
func verifyToken(token string, secret []byte) (userID int, ok bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, false
	}
	payload := parts[0] + "." + parts[1]
	// hmac.Equal is a constant-time compare, which avoids timing attacks.
	if !hmac.Equal([]byte(parts[2]), []byte(sign(payload, secret))) {
		return 0, false
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().After(time.Unix(exp, 0)) {
		return 0, false
	}
	id, err := strconv.Atoi(parts[0])
	if err != nil {
		return 0, false
	}
	return id, true
}

// sign computes the hex HMAC-SHA256 of payload with the given secret.
func sign(payload string, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))
}
