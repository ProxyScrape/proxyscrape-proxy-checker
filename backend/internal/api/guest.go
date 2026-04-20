package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/proxyscrape/checker-backend/internal/geoworker"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
)

const (
	guestCookieName = "checker_guest_session"
	guestSessionTTL = 24 * time.Hour
)

// guestSessionKey is the context key used to pass the validated guest session ID
// from GuestAuthMiddleware to route handlers.
type guestSessionKey struct{}

// guestSessionIDFromCtx retrieves the guest session ID injected by GuestAuthMiddleware.
// Returns "" when not in guest mode.
func guestSessionIDFromCtx(ctx context.Context) string {
	v, _ := ctx.Value(guestSessionKey{}).(string)
	return v
}

// newGuestSessionID generates a cryptographically random 32-byte session ID
// encoded as unpadded base64url (43 chars, URL-safe, no padding).
func newGuestSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// NewGuestAuthMiddleware returns middleware that authenticates requests using
// the HttpOnly guest session cookie. On success it injects the session ID into
// the request context. On failure it returns 401.
func NewGuestAuthMiddleware(db *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie(guestCookieName)
			if err != nil || cookie.Value == "" {
				jsonUnauthorized(w)
				return
			}
			sid := cookie.Value
			if !db.ValidateGuestSession(r.Context(), sid) {
				jsonUnauthorized(w)
				return
			}
			// Extend the session TTL on each authenticated request (sliding window).
			if err := db.TouchGuestSession(r.Context(), sid, time.Now().Add(guestSessionTTL)); err != nil {
				log.Printf("[guest] touch session %s: %v", sid, err)
			}
			ctx := context.WithValue(r.Context(), guestSessionKey{}, sid)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// routeKey uniquely identifies a registered HTTP endpoint by method and chi route pattern.
type routeKey struct {
	method  string
	pattern string
}

// guestAllowed is the explicit allowlist of (method, route-pattern) pairs that
// guest sessions may access. Every route registered in NewGuestServer MUST appear
// in exactly one of guestAllowed or guestBlocked, or the server panics at startup.
//
// Priority: guestBlocked takes precedence over guestAllowed.
var guestAllowed = map[routeKey]struct{}{
	{http.MethodGet,    "/api/mode"}:                  {},
	{http.MethodPost,   "/api/guest/session"}:          {},
	{http.MethodGet,    "/api/check/active"}:          {},
	{http.MethodGet,    "/api/check/{id}/events"}:     {},
	{http.MethodPost,   "/api/check"}:                 {},
	{http.MethodDelete, "/api/check/{id}"}:            {},
	{http.MethodGet,    "/api/checks"}:                {},
	{http.MethodDelete, "/api/checks"}:                {},
	{http.MethodGet,    "/api/checks/{id}/results"}:   {},
	{http.MethodDelete, "/api/checks/{id}"}:           {},
	{http.MethodGet,    "/api/settings"}:              {},
	{http.MethodGet,    "/api/judges/refresh"}:        {},
	{http.MethodGet,    "/api/blacklist/status"}:      {},
	{http.MethodGet,    "/api/version"}:               {},
	{http.MethodGet,    "/api/trace/status"}:          {},
}

// guestBlocked is the explicit denylist of (method, route-pattern) pairs that
// guest sessions may NOT access. Blocked takes priority over guestAllowed.
var guestBlocked = map[routeKey]struct{}{
	{http.MethodPut,    "/api/settings"}:              {},
	{http.MethodPost,   "/api/blacklist/refresh"}:     {},
	{http.MethodPost,   "/api/geo/enrich"}:            {},
	{http.MethodDelete, "/api/geo/enrich"}:            {},
}

// NewGuestModeGuard returns middleware that enforces the guest-mode access policy.
//
// It matches the request method + URL path against guestBlocked (checked first,
// blocked wins) and guestAllowed. An unrecognised route is denied with 403 and
// logged as a programming error — the startup validateGuestRoutes call should have
// caught any missing declarations before the server ever accepts traffic.
//
// Note: chi.RouteContext().RoutePattern() is NOT used here because middlewares
// registered with r.Use() inside an r.Route() block run before chi resolves the
// specific leaf route, so RoutePattern() only returns the subrouter wildcard
// (e.g. "/api/*") rather than the full matched pattern (e.g. "/api/mode").
// Using r.URL.Path with pathMatchesPattern avoids this timing issue entirely.
func NewGuestModeGuard() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			method, path := r.Method, r.URL.Path

			// Blocked takes priority — check first.
			for key := range guestBlocked {
				if key.method == method && pathMatchesPattern(path, key.pattern) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					_, _ = w.Write([]byte(`{"error":"not allowed in guest mode"}`))
					return
				}
			}
			// Check allowed.
			for key := range guestAllowed {
				if key.method == method && pathMatchesPattern(path, key.pattern) {
					next.ServeHTTP(w, r)
					return
				}
			}
			// Route is in neither list — programming error; deny and log.
			log.Printf("[guest] BUG: uncovered route %s %s — denying request", method, path)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"not allowed in guest mode"}`))
		})
	}
}

// pathMatchesPattern reports whether path matches a chi-style route pattern.
// Segments wrapped in braces (e.g. {id}) match any single non-empty path segment.
func pathMatchesPattern(path, pattern string) bool {
	pathParts := strings.Split(strings.Trim(path, "/"), "/")
	patParts := strings.Split(strings.Trim(pattern, "/"), "/")
	if len(pathParts) != len(patParts) {
		return false
	}
	for i, p := range patParts {
		if strings.HasPrefix(p, "{") && strings.HasSuffix(p, "}") {
			continue // wildcard segment — matches any value
		}
		if p != pathParts[i] {
			return false
		}
	}
	return true
}

// validateGuestRoutes walks r and panics if any registered (method, pattern) pair
// is absent from both guestAllowed and guestBlocked. Call once at startup.
func validateGuestRoutes(r chi.Router) {
	var uncovered []string
	_ = chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		key := routeKey{method: method, pattern: route}
		_, inAllowed := guestAllowed[key]
		_, inBlocked := guestBlocked[key]
		if !inAllowed && !inBlocked {
			uncovered = append(uncovered, method+" "+route)
		}
		return nil
	})
	if len(uncovered) > 0 {
		panic(fmt.Sprintf(
			"guest mode: uncovered routes — add each to guestAllowed or guestBlocked in guest.go:\n  %s",
			strings.Join(uncovered, "\n  "),
		))
	}
}

// handleGuestSession handles POST /api/guest/session.
// It creates a new guest session (or refreshes an existing valid one) and
// sets the HttpOnly session cookie. The response body carries the expiry time.
func (s *server) handleGuestSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Reuse existing valid session if present.
	if cookie, err := r.Cookie(guestCookieName); err == nil && cookie.Value != "" {
		if s.store.ValidateGuestSession(ctx, cookie.Value) {
			expiresAt := time.Now().Add(guestSessionTTL)
			if err := s.store.TouchGuestSession(ctx, cookie.Value, expiresAt); err != nil {
				log.Printf("[guest] touch session: %v", err)
			}
			setGuestCookie(w, cookie.Value, expiresAt)
			// Do NOT echo the session ID back — it lives only in the HttpOnly cookie.
			writeJSON(w, map[string]string{
				"expires_at": expiresAt.UTC().Format(time.RFC3339),
			})
			return
		}
	}

	// Create a brand-new session.
	sid, err := newGuestSessionID()
	if err != nil {
		log.Printf("[guest] generate session id: %v", err)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	expiresAt := time.Now().Add(guestSessionTTL)
	if err := s.store.CreateGuestSession(ctx, sid, expiresAt); err != nil {
		log.Printf("[guest] create session: %v", err)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	setGuestCookie(w, sid, expiresAt)
	// Do NOT echo the session ID back — the HttpOnly cookie is the sole bearer.
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
}

// secureCookies reports whether the Secure cookie flag should be set.
// Defaults to false so the app works out-of-the-box over plain HTTP.
// Set CHECKER_HTTPS=true when the server is behind a TLS terminator.
func secureCookies() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv("CHECKER_HTTPS")), "true")
}

// guestAllowedOrigins returns the CORS allowed-origins list for guest mode.
// Override with a comma-separated GUEST_ALLOWED_ORIGINS env var in production.
// Defaults to localhost on common dev ports.
func guestAllowedOrigins() []string {
	if raw := strings.TrimSpace(os.Getenv("GUEST_ALLOWED_ORIGINS")); raw != "" {
		var origins []string
		for _, o := range strings.Split(raw, ",") {
			if trimmed := strings.TrimSpace(o); trimmed != "" {
				origins = append(origins, trimmed)
			}
		}
		if len(origins) > 0 {
			return origins
		}
	}
	// Safe defaults for local development.
	return []string{
		"http://localhost:*",
		"http://127.0.0.1:*",
	}
}

// setGuestCookie writes the HttpOnly guest session cookie.
func setGuestCookie(w http.ResponseWriter, sid string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     guestCookieName,
		Value:    sid,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(time.Until(expiresAt).Seconds()),
		HttpOnly: true,
		Secure:   secureCookies(), // enable via CHECKER_HTTPS=true behind TLS
		SameSite: http.SameSiteLaxMode,
	})
}

// NewGuestServer builds the HTTP API router for guest mode.
// Authentication uses HttpOnly cookies instead of Bearer tokens.
// Write operations on settings, judges, and blacklists are blocked.
// All check data is scoped to the requesting session.
//
// inFlightLimit caps the number of proxies a single guest session may have
// actively checking at once. Each session is tracked independently via a
// sync.Map keyed by session ID. Pass the value of the --guest-max-proxies-in-flight
// CLI flag; 0 disables the limit.
func NewGuestServer(db *store.Store, mgr *settings.Manager, geoWorker *geoworker.Client, inFlightLimit int) http.Handler {
	r := newGuestRouter(db, mgr, geoWorker, inFlightLimit)
	// Panic at startup if any registered route is missing from guestAllowed/guestBlocked.
	// This ensures every future route addition is a conscious policy decision.
	validateGuestRoutes(r)
	return r
}

// newGuestRouter constructs the chi.Router for guest mode and returns it directly
// so callers (including tests) can use chi.Walk on the real route tree without
// triggering the startup panic from validateGuestRoutes.
//
// All three store/settings/geoWorker dependencies may be nil when the router is
// constructed solely for route enumeration (e.g. TestGuestRoutesCoverage). Nil
// deps are captured by handler closures but never dereferenced during route
// registration or chi.Walk.
func newGuestRouter(db *store.Store, mgr *settings.Manager, geoWorker *geoworker.Client, inFlightLimit int) chi.Router {
	s := &server{
		store:              db,
		settings:           mgr,
		geoWorker:          geoWorker,
		mode:               "guest",
		guestInFlightLimit: inFlightLimit,
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		// AllowCredentials requires an explicit origin list — wildcards are not
		// permitted by the CORS spec when credentials are included.
		// Defaults to localhost only; override with GUEST_ALLOWED_ORIGINS env var.
		AllowedOrigins:   guestAllowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	guestAuth := NewGuestAuthMiddleware(db)
	guard := NewGuestModeGuard()

	r.Route("/api", func(r chi.Router) {
		// Guard runs first for all /api routes. It matches r.URL.Path (the full
		// original path, preserved by chi even inside sub-routers) against
		// guestAllowed / guestBlocked. Blocked takes priority.
		r.Use(guard)

		// Public — no auth required.
		r.Get("/mode", s.handleGetMode)

		// Session bootstrap — public, no cookie required.
		r.Group(func(r chi.Router) {
			r.Use(sessionRateLimit)
			r.Post("/guest/session", s.handleGuestSession)
		})

		// SSE — cookie auth (browser EventSource sends cookies automatically).
		r.Group(func(r chi.Router) {
			r.Use(guestAuth)
			r.Get("/check/{id}/events", s.handleCheckEvents)
		})

		// REST — cookie auth.
		r.Group(func(r chi.Router) {
			r.Use(guestAuth)

			// /check/active must be registered before /check/{id} so chi matches
			// the literal segment "active" rather than treating it as a wildcard.
			r.Get("/check/active", s.handleActiveCheck)

			r.Post("/check", s.handleStartCheck)
			r.Delete("/check/{id}", s.handleStopCheck)

			r.Get("/checks", s.handleListChecks)
			r.Delete("/checks", s.handleClearChecks)
			r.Get("/checks/{id}/results", s.handleGetCheckResults)
			r.Delete("/checks/{id}", s.handleDeleteCheck)

			r.Get("/settings", s.handleGetSettings)
			r.Put("/settings", s.handleUpdateSettings) // blocked by guard

			// GET: read-only ping of configured judges — allowed for guests.
			r.Get("/judges/refresh", s.handleJudgesRefresh)

			r.Get("/blacklist/status", s.handleBlacklistStatus)
			r.Post("/blacklist/refresh", s.handleBlacklistRefresh) // blocked by guard

			// GET /ip is intentionally absent in guest mode: it would expose
			// the server's real public IP address to untrusted clients.
			// The backend resolves its own IP silently per-check via the
			// configured lookup URL.
			r.Get("/version", s.handleGetVersion)
			r.Get("/trace/status", s.handleTraceStatus)

			r.Post("/geo/enrich", s.handleGeoEnrichStart)    // blocked by guard
			r.Delete("/geo/enrich", s.handleGeoEnrichCancel) // blocked by guard
			// GET /geo/enrich is intentionally absent in guest mode: the endpoint
			// reflects a global background-job state, not per-session state.
			// In guest mode geo enrichment is inline (per-check via SSE) so
			// this endpoint would always show "idle" and is misleading.
		})
	})

	return r
}

// --- Rate limit: 20 POST /api/guest/session requests per minute per IP ---

func sessionRateLimit(next http.Handler) http.Handler {
	lim := &loginLimiter{
		byIP:   make(map[string][]time.Time),
		window: time.Minute,
		max:    20,
	}
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
