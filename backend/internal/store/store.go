package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Store provides SQLite-backed persistence for users, sessions, and proxy check results.
type Store struct {
	mu     sync.Mutex
	db     *sql.DB
	dbPath string
}

// User represents a server-mode account.
type User struct {
	ID           string
	Username     string
	PasswordHash string
	CreatedAt    time.Time
}

// Session represents an authenticated browser session.
type Session struct {
	Token     string
	UserID    string
	ExpiresAt time.Time
}

// Check is a top-level proxy check run record.
type Check struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	Total      int       `json:"total_checked"`
	Working    int       `json:"working_count"`
	TimeoutMs  int64     `json:"timeout_ms"`
	DurationMs int64     `json:"duration_ms"`
	Protocols  []string  `json:"protocols"`
}

// CheckResult is a single proxy result within a Check.
type CheckResult struct {
	ID          string
	CheckID     string
	Host        string
	Port        int
	Auth        string
	Status      string
	Protocols   []string
	Anon        string
	TimeoutMs   int64
	CountryCode string
	CountryName string
	CountryFlag string
	City        string
	Blacklists  []string
	Errors      map[string]string
	Server      string
	KeepAlive   bool
	TracesJSON   string // JSON-serialized map[protocol][]TraceEvent, empty when no trace
	FullDataJSON string // JSON-serialized map[protocol]ProtoFullData, empty when not captured
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS checks (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  total INTEGER NOT NULL,
  working INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  protocols TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  auth TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'failed',
  protocols TEXT NOT NULL,
  anon TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  country_flag TEXT NOT NULL,
  city TEXT NOT NULL,
  blacklists TEXT NOT NULL,
  errors TEXT NOT NULL DEFAULT '{}',
  server TEXT NOT NULL,
  keep_alive INTEGER NOT NULL,
  traces TEXT,
  full_data TEXT,
  FOREIGN KEY(check_id) REFERENCES checks(id) ON DELETE CASCADE
);
`

// Open opens (or creates) the SQLite database at <dataDir>/checker.db.
func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("store: create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "checker.db")
	db, err := openDB(dbPath)
	if err != nil {
		return nil, err
	}
	return &Store{db: db, dbPath: dbPath}, nil
}

func openDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("store: open: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("store: apply schema: %w", err)
	}
	return db, nil
}


// Close shuts down the database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

// --- helpers ---

func marshalJSON(v interface{}) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func unmarshalStrings(raw string) ([]string, error) {
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func unmarshalStringMap(raw string) (map[string]string, error) {
	var out map[string]string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil, err
	}
	return out, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// --- Users ---

// CreateUser inserts a new user record.
func (s *Store) CreateUser(ctx context.Context, id, username, passwordHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
		id, username, passwordHash, time.Now().Unix(),
	)
	if err != nil {
		return fmt.Errorf("store: create user: %w", err)
	}
	return nil
}

// GetUserByUsername returns the user with the given username, or nil if not found.
func (s *Store) GetUserByUsername(ctx context.Context, username string) (*User, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`, username,
	)
	u := &User{}
	var ts int64
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &ts); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("store: get user: %w", err)
	}
	u.CreatedAt = time.Unix(ts, 0)
	return u, nil
}

// ListUsers returns all users ordered by created_at.
func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, username, password_hash, created_at FROM users ORDER BY created_at`,
	)
	if err != nil {
		return nil, fmt.Errorf("store: list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var ts int64
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &ts); err != nil {
			return nil, fmt.Errorf("store: scan user: %w", err)
		}
		u.CreatedAt = time.Unix(ts, 0)
		users = append(users, u)
	}
	return users, rows.Err()
}

// DeleteUser removes the user with the given username.
func (s *Store) DeleteUser(ctx context.Context, username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE username = ?`, username)
	if err != nil {
		return fmt.Errorf("store: delete user: %w", err)
	}
	return nil
}

// UpdateUserPassword sets a new password hash for the given username.
func (s *Store) UpdateUserPassword(ctx context.Context, username, passwordHash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = ? WHERE username = ?`, passwordHash, username,
	)
	if err != nil {
		return fmt.Errorf("store: update password: %w", err)
	}
	return nil
}

// HasUsers reports whether any user rows exist.
func (s *Store) HasUsers(ctx context.Context) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("store: has users: %w", err)
	}
	return count > 0, nil
}

// --- Sessions ---

// CreateSession inserts a new session token.
func (s *Store) CreateSession(ctx context.Context, token, userID string, expiresAt time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expiresAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("store: create session: %w", err)
	}
	return nil
}

// ValidateSession returns true if the token exists and has not expired.
func (s *Store) ValidateSession(ctx context.Context, token string) bool {
	var expiresAt int64
	err := s.db.QueryRowContext(ctx,
		`SELECT expires_at FROM sessions WHERE token = ?`, token,
	).Scan(&expiresAt)
	if err != nil {
		return false
	}
	return time.Now().Unix() < expiresAt
}

// DeleteSession removes a session token.
func (s *Store) DeleteSession(ctx context.Context, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token = ?`, token)
	if err != nil {
		return fmt.Errorf("store: delete session: %w", err)
	}
	return nil
}

// PurgeExpiredSessions deletes all sessions whose expiry has passed.
func (s *Store) PurgeExpiredSessions(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix(),
	)
	if err != nil {
		return fmt.Errorf("store: purge sessions: %w", err)
	}
	return nil
}

// --- Checks ---

// SaveCheck inserts a check run record.
func (s *Store) SaveCheck(ctx context.Context, c Check) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	protocols, err := marshalJSON(c.Protocols)
	if err != nil {
		return fmt.Errorf("store: marshal protocols: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO checks (id, created_at, total, working, timeout_ms, duration_ms, protocols)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.CreatedAt.Unix(), c.Total, c.Working, c.TimeoutMs, c.DurationMs, protocols,
	)
	if err != nil {
		return fmt.Errorf("store: save check: %w", err)
	}
	return nil
}

// SaveCheckResults bulk-inserts proxy check results within a single transaction.
func (s *Store) SaveCheckResults(ctx context.Context, results []CheckResult) error {
	if len(results) == 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("store: begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO check_results
		 (id, check_id, host, port, auth, status, protocols, anon, timeout_ms,
		  country_code, country_name, country_flag, city, blacklists, errors, server, keep_alive, traces, full_data)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
	if err != nil {
		return fmt.Errorf("store: prepare stmt: %w", err)
	}
	defer stmt.Close()

	for _, r := range results {
		protocols, err := marshalJSON(r.Protocols)
		if err != nil {
			return fmt.Errorf("store: marshal protocols: %w", err)
		}
		blacklists, err := marshalJSON(r.Blacklists)
		if err != nil {
			return fmt.Errorf("store: marshal blacklists: %w", err)
		}
		var errorsJSON string
		if r.Errors == nil {
			errorsJSON = "{}"
		} else {
			b, err := json.Marshal(r.Errors)
			if err != nil {
				return fmt.Errorf("store: marshal errors: %w", err)
			}
			errorsJSON = string(b)
		}

		var tracesVal interface{}
		if r.TracesJSON != "" {
			tracesVal = r.TracesJSON
		}
		var fullDataVal interface{}
		if r.FullDataJSON != "" {
			fullDataVal = r.FullDataJSON
		}

		if _, err := stmt.ExecContext(ctx,
			r.ID, r.CheckID, r.Host, r.Port, r.Auth, r.Status,
			protocols, r.Anon, r.TimeoutMs,
			r.CountryCode, r.CountryName, r.CountryFlag, r.City,
			blacklists, errorsJSON, r.Server, boolToInt(r.KeepAlive), tracesVal, fullDataVal,
		); err != nil {
			return fmt.Errorf("store: insert check result: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("store: commit: %w", err)
	}
	return nil
}

// ListChecks returns all check runs ordered by created_at descending.
func (s *Store) ListChecks(ctx context.Context) ([]Check, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, created_at, total, working, timeout_ms, duration_ms, protocols
		 FROM checks ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("store: list checks: %w", err)
	}
	defer rows.Close()

	var checks []Check
	for rows.Next() {
		var c Check
		var ts int64
		var protocols string
		if err := rows.Scan(&c.ID, &ts, &c.Total, &c.Working, &c.TimeoutMs, &c.DurationMs, &protocols); err != nil {
			return nil, fmt.Errorf("store: scan check: %w", err)
		}
		c.CreatedAt = time.Unix(ts, 0)
		if c.Protocols, err = unmarshalStrings(protocols); err != nil {
			// Skip rows with invalid/legacy protocol JSON rather than aborting the list.
			c.Protocols = []string{}
		}
		checks = append(checks, c)
	}
	return checks, rows.Err()
}

// GetCheckResults returns a paginated page of results for a given check, plus the total count.
func (s *Store) GetCheckResults(ctx context.Context, checkID string, page, limit int) ([]CheckResult, int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM check_results WHERE check_id = ?`, checkID,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("store: count results: %w", err)
	}

	offset := (page - 1) * limit
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, check_id, host, port, auth, status, protocols, anon, timeout_ms,
		        country_code, country_name, country_flag, city, blacklists, errors, server, keep_alive, traces, full_data
		 FROM check_results WHERE check_id = ?
		 ORDER BY id LIMIT ? OFFSET ?`,
		checkID, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("store: query results: %w", err)
	}
	defer rows.Close()

	var results []CheckResult
	for rows.Next() {
		var r CheckResult
		var keepAlive int
		var protocols, blacklists, errorsJSON string
		var tracesJSON, fullDataJSON sql.NullString
		if err := rows.Scan(
			&r.ID, &r.CheckID, &r.Host, &r.Port, &r.Auth, &r.Status,
			&protocols, &r.Anon, &r.TimeoutMs,
			&r.CountryCode, &r.CountryName, &r.CountryFlag, &r.City,
			&blacklists, &errorsJSON, &r.Server, &keepAlive, &tracesJSON, &fullDataJSON,
		); err != nil {
			return nil, 0, fmt.Errorf("store: scan result: %w", err)
		}
		r.KeepAlive = keepAlive != 0
		if tracesJSON.Valid {
			r.TracesJSON = tracesJSON.String
		}
		if fullDataJSON.Valid {
			r.FullDataJSON = fullDataJSON.String
		}
		if r.Protocols, err = unmarshalStrings(protocols); err != nil {
			return nil, 0, fmt.Errorf("store: unmarshal protocols: %w", err)
		}
		if r.Blacklists, err = unmarshalStrings(blacklists); err != nil {
			return nil, 0, fmt.Errorf("store: unmarshal blacklists: %w", err)
		}
		if r.Errors, err = unmarshalStringMap(errorsJSON); err != nil {
			// Non-fatal: default to empty map if stored data is malformed
			r.Errors = map[string]string{}
		}
		results = append(results, r)
	}
	return results, total, rows.Err()
}

// DeleteCheck removes a check and all its results (cascade).
func (s *Store) DeleteCheck(ctx context.Context, checkID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `DELETE FROM checks WHERE id = ?`, checkID)
	if err != nil {
		return fmt.Errorf("store: delete check: %w", err)
	}
	return nil
}

// Reset deletes the database file and recreates it with a fresh schema,
// clearing all history without any need for migrations.
func (s *Store) Reset() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = s.db.Close()
	_ = os.Remove(s.dbPath)

	db, err := openDB(s.dbPath)
	if err != nil {
		return err
	}
	s.db = db
	return nil
}
