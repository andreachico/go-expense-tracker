package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
)

// ErrUserExists is returned when registering a username that's already taken.
// ErrEmailExists is returned when registering an email that's already in use.
// ErrUserNotFound is returned when no account matches a lookup.
var (
	ErrUserExists   = errors.New("username already taken")
	ErrEmailExists  = errors.New("email already in use")
	ErrUserNotFound = errors.New("user not found")
)

// Store persists user accounts. Like the other packages, the handlers depend on
// this interface so the in-memory and PostgreSQL implementations interchange.
type Store interface {
	Create(ctx context.Context, username, email, passwordHash, firstName, lastName string) (User, error)
	GetByUsername(ctx context.Context, username string) (User, error)
	GetByID(ctx context.Context, id int) (User, error)
}

// MemoryStore keeps users in a map; data is lost when the program stops. A
// mutex guards the maps because the server serves requests concurrently.
type MemoryStore struct {
	mu      sync.Mutex
	byID    map[int]User
	byName  map[string]int // lowercased username -> id
	byEmail map[string]int // lowercased email -> id
	nextID  int
}

// NewMemoryStore returns an empty, ready-to-use in-memory user store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		byID:    make(map[int]User),
		byName:  make(map[string]int),
		byEmail: make(map[string]int),
		nextID:  1,
	}
}

// Create adds a new user, rejecting a duplicate (case-insensitive) username.
func (s *MemoryStore) Create(_ context.Context, username, email, passwordHash, firstName, lastName string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := strings.ToLower(username)
	if _, exists := s.byName[key]; exists {
		return User{}, ErrUserExists
	}
	emailKey := strings.ToLower(email)
	if emailKey != "" {
		if _, exists := s.byEmail[emailKey]; exists {
			return User{}, ErrEmailExists
		}
	}
	u := User{
		ID:           s.nextID,
		Username:     username,
		Email:        email,
		FirstName:    firstName,
		LastName:     lastName,
		PasswordHash: passwordHash,
	}
	s.nextID++
	s.byID[u.ID] = u
	s.byName[key] = u.ID
	if emailKey != "" {
		s.byEmail[emailKey] = u.ID
	}
	return u, nil
}

// GetByUsername looks up a user by their (case-insensitive) username.
func (s *MemoryStore) GetByUsername(_ context.Context, username string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, ok := s.byName[strings.ToLower(username)]
	if !ok {
		return User{}, ErrUserNotFound
	}
	return s.byID[id], nil
}

// GetByID looks up a user by their numeric ID.
func (s *MemoryStore) GetByID(_ context.Context, id int) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	u, ok := s.byID[id]
	if !ok {
		return User{}, ErrUserNotFound
	}
	return u, nil
}
