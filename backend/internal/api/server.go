package api

import (
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/proxyscrape/checker-backend/internal/blacklist"
	"github.com/proxyscrape/checker-backend/internal/geoworker"
	"github.com/proxyscrape/checker-backend/internal/judges"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
)

// appVersion is injected at build time via -ldflags -X (variable MUST have no
// initializer for -X to work). Dev mode overrides it via APP_VERSION env var.
var appVersion string

func init() {
	if v := os.Getenv("APP_VERSION"); v != "" {
		appVersion = v
		return
	}
	if appVersion == "" {
		appVersion = "dev"
	}
}

// server holds shared dependencies available to all route handlers.
type server struct {
	store     *store.Store
	settings  *settings.Manager
	verify    TokenVerifier
	checks    sync.Map // map[string]*runningCheck
	mu        sync.RWMutex
	judges    *judges.Judges
	blists    *blacklist.Blacklist
	geoWorker *geoworker.Client
	// mode is "desktop", "server", or "guest". Handlers use it to apply
	// mode-specific logic (e.g. session-scoped clears in guest mode).
	mode string
	// guestInFlightLimit is the maximum number of proxies that may be actively
	// checked within a single guest session at once. Set at startup from the
	// --guest-max-proxies-in-flight CLI flag; 0 means no limit.
	guestInFlightLimit int
	// guestSessionInFlight maps guest session ID → *atomic.Int64, tracking
	// the number of proxies currently being checked for that session. Each
	// session has its own counter so one user cannot affect another's quota.
	guestSessionInFlight sync.Map
}

// NewServer builds the HTTP API router.
//
// Route groups:
//   - Public:  POST /api/login (rate-limited, no token required)
//   - SSE:     GET  /api/check/{id}/events, GET /api/geo/enrich/events
//              (NewSSEAuthMiddleware — Bearer header OR ?token= query param,
//              required because browser EventSource cannot set custom headers)
//   - REST:    all other /api/* routes (NewAuthMiddleware — Bearer header only)
// NewServer builds the HTTP API router for desktop and server modes.
// For guest mode use NewGuestServer instead.
func NewServer(verifier TokenVerifier, db *store.Store, mgr *settings.Manager, geoWorker *geoworker.Client, mode string) http.Handler {
	s := &server{
		store:     db,
		settings:  mgr,
		verify:    verifier,
		geoWorker: geoWorker,
		mode:      mode,
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
		// Public — no auth required.
		r.Get("/mode", s.handleGetMode)

		// Public — no token required.
		r.Group(func(r chi.Router) {
			r.Use(loginRateLimit)
			r.Post("/login", s.handleLogin)
		})

		// SSE — Bearer header OR ?token= query param (browser EventSource compat).
		r.Group(func(r chi.Router) {
			r.Use(NewSSEAuthMiddleware(verifier))
			r.Get("/check/{id}/events", s.handleCheckEvents)
			r.Get("/geo/enrich/events", s.handleGeoEnrichEvents)
		})

		// REST — Bearer header only.
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

			r.Get("/judges/refresh", s.handleJudgesRefresh)

			r.Get("/blacklist/status", s.handleBlacklistStatus)
			r.Post("/blacklist/refresh", s.handleBlacklistRefresh)

			r.Get("/ip", s.handleGetIP)
			r.Get("/version", s.handleGetVersion)
			r.Get("/trace/status", s.handleTraceStatus)

			r.Post("/geo/enrich", s.handleGeoEnrichStart)
			r.Delete("/geo/enrich", s.handleGeoEnrichCancel)
			r.Get("/geo/enrich", s.handleGeoEnrichStatus)
		})
	})

	return r
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
