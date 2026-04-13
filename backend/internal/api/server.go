package api

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/proxyscrape/checker-backend/internal/blacklist"
	"github.com/proxyscrape/checker-backend/internal/judges"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
)

const appVersion = "2.0.0-canary"

// server holds shared dependencies available to all route handlers.
type server struct {
	store    *store.Store
	settings *settings.Manager
	verify   TokenVerifier
	checks   sync.Map // map[string]*runningCheck
	mu       sync.RWMutex
	judges   *judges.Judges
	blists   *blacklist.Blacklist
}

// NewServer builds the HTTP API router. POST /api/login is unauthenticated and rate-limited;
// GET /api/check/{id}/events validates its token inside the handler;
// all other /api routes go through the auth middleware.
func NewServer(verifier TokenVerifier, db *store.Store, mgr *settings.Manager) http.Handler {
	s := &server{
		store:    db,
		settings: mgr,
		verify:   verifier,
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(loginRateLimit)
			r.Post("/login", s.handleLogin)
		})

		r.Get("/check/{id}/events", s.handleCheckEvents)

		r.Group(func(r chi.Router) {
			r.Use(NewAuthMiddleware(verifier))

			r.Post("/check", s.handleStartCheck)
			r.Delete("/check/{id}", s.handleStopCheck)

			r.Get("/checks", s.handleListChecks)
			r.Delete("/checks", s.handleClearChecks)
			r.Get("/checks/{id}/results", s.handleGetCheckResults)
			r.Delete("/checks/{id}", s.handleDeleteCheck)

			r.Get("/settings", s.handleGetSettings)
			r.Put("/settings", s.handleUpdateSettings)

			r.Post("/judges/refresh", s.handleJudgesRefresh)

			r.Get("/blacklist/status", s.handleBlacklistStatus)
			r.Post("/blacklist/refresh", s.handleBlacklistRefresh)

			r.Get("/ip", s.handleGetIP)
			r.Get("/version", s.handleGetVersion)
			r.Get("/trace/status", s.handleTraceStatus)
		})
	})

	return r
}

func extractBearer(r *http.Request) string {
	raw := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(raw, prefix) {
		return ""
	}
	return strings.TrimSpace(raw[len(prefix):])
}

// --- Rate limit: 10 POST /api/login requests per minute per IP (in-memory) ---

type loginLimiter struct {
	mu     sync.Mutex
	byIP   map[string][]time.Time
	window time.Duration
	max    int
}

func newLoginLimiter() *loginLimiter {
	return &loginLimiter{
		byIP:   make(map[string][]time.Time),
		window: time.Minute,
		max:    10,
	}
}

func (l *loginLimiter) allow(ip string) bool {
	now := time.Now()
	cutoff := now.Add(-l.window)

	l.mu.Lock()
	defer l.mu.Unlock()

	ts := l.byIP[ip]
	out := ts[:0]
	for _, t := range ts {
		if t.After(cutoff) {
			out = append(out, t)
		}
	}
	if len(out) >= l.max {
		l.byIP[ip] = out
		return false
	}
	out = append(out, now)
	l.byIP[ip] = out
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func loginRateLimit(next http.Handler) http.Handler {
	lim := newLoginLimiter()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !lim.allow(clientIP(r)) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"rate limit exceeded"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
