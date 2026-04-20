package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// TestGuestRoutesCoverage calls the real newGuestRouter (with nil deps — safe
// because no handlers are invoked during route registration or chi.Walk) and
// asserts every registered (method, pattern) pair is declared in guestAllowed
// or guestBlocked. This is the primary enforcement mechanism: if a route is
// added to newGuestRouter without updating the policy maps, this test fails and
// the pre-push hook blocks the push.
//
// Note: newGuestRouter does NOT call validateGuestRoutes internally — that lives
// in NewGuestServer (production startup). This separation ensures the chi.Walk
// below is the actual check, not dead code shadowed by an earlier panic.
func TestGuestRoutesCoverage(t *testing.T) {
	r := newGuestRouter(nil, nil, nil, 0)

	var uncovered []string
	_ = chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		key := routeKey{method: method, pattern: route}
		_, inAllowed := guestAllowed[key]
		_, inBlocked := guestBlocked[key]
		if !inAllowed && !inBlocked {
			uncovered = append(uncovered, fmt.Sprintf("%s %s", method, route))
		}
		return nil
	})

	if len(uncovered) > 0 {
		t.Errorf("guest mode: %d route(s) not declared in guestAllowed or guestBlocked — add them to guest.go:", len(uncovered))
		for _, route := range uncovered {
			t.Errorf("  missing: %s", route)
		}
	}
}

// TestGuestBlockedNotInAllowed flags routes that appear in both maps with the
// same (method, pattern). Blocked takes priority so it would still work, but
// the duplication is almost certainly a mistake.
func TestGuestBlockedNotInAllowed(t *testing.T) {
	for key := range guestBlocked {
		if _, inAllowed := guestAllowed[key]; inAllowed {
			t.Errorf("route %s %s appears in both guestAllowed and guestBlocked — remove it from guestAllowed", key.method, key.pattern)
		}
	}
}

// TestValidateGuestRoutesPanicsOnUncoveredRoute verifies that validateGuestRoutes
// panics when a registered route is absent from both policy maps. This proves
// the startup safety net works before it is ever needed in production.
func TestValidateGuestRoutesPanicsOnUncoveredRoute(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("expected validateGuestRoutes to panic for an uncovered route, but it did not")
		}
	}()

	r := chi.NewRouter()
	r.Get("/api/uncovered", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {}))
	validateGuestRoutes(r) // must panic
}

// TestGuestModeGuardPolicy verifies that the guard allows routes in guestAllowed,
// blocks routes in guestBlocked, and denies routes absent from both maps.
//
// The guard uses r.URL.Path + pathMatchesPattern (not chi.RouteContext) so it
// works correctly regardless of where in the chi middleware stack it runs.
func TestGuestModeGuardPolicy(t *testing.T) {
	noop := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	guard := NewGuestModeGuard()

	r := chi.NewRouter()
	r.Use(guard)
	r.Get("/api/mode", noop)                    // guestAllowed
	r.Put("/api/settings", noop)                // guestBlocked
	r.Get("/api/judges/refresh", noop)          // guestAllowed
	r.Delete("/api/check/{id}", noop)           // guestAllowed — tests {param} matching
	r.Post("/api/blacklist/refresh", noop)      // guestBlocked
	r.Get("/api/checks/{id}/results", noop)     // guestAllowed — two-segment param path

	tests := []struct {
		method string
		path   string
		want   int
		label  string
	}{
		{http.MethodGet, "/api/mode", http.StatusOK, "allowed: GET /api/mode"},
		{http.MethodPut, "/api/settings", http.StatusForbidden, "blocked: PUT /api/settings"},
		{http.MethodGet, "/api/judges/refresh", http.StatusOK, "allowed: GET /api/judges/refresh"},
		{http.MethodDelete, "/api/check/abc-123", http.StatusOK, "allowed: DELETE /api/check/{id}"},
		{http.MethodPost, "/api/blacklist/refresh", http.StatusForbidden, "blocked: POST /api/blacklist/refresh"},
		{http.MethodGet, "/api/checks/abc-123/results", http.StatusOK, "allowed: GET /api/checks/{id}/results"},
	}

	for _, tc := range tests {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Errorf("%s: got HTTP %d, want %d", tc.label, rec.Code, tc.want)
		}
	}
}

// TestGuestModeGuardPolicyNestedRouter repeats the policy checks using a
// r.Route("/api", ...) sub-router — the same structure as the real server.
// This proves that chi preserves r.URL.Path (the full original path) inside
// sub-routers, so the guard's pattern matching works correctly in production.
func TestGuestModeGuardPolicyNestedRouter(t *testing.T) {
	noop := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	guard := NewGuestModeGuard()

	r := chi.NewRouter()
	r.Route("/api", func(r chi.Router) {
		r.Use(guard)
		r.Get("/mode", noop)           // guestAllowed as /api/mode
		r.Put("/settings", noop)       // guestBlocked as /api/settings
		r.Get("/judges/refresh", noop) // guestAllowed as /api/judges/refresh
	})

	tests := []struct {
		method string
		path   string
		want   int
		label  string
	}{
		{http.MethodGet, "/api/mode", http.StatusOK, "nested: allowed GET /api/mode"},
		{http.MethodPut, "/api/settings", http.StatusForbidden, "nested: blocked PUT /api/settings"},
		{http.MethodGet, "/api/judges/refresh", http.StatusOK, "nested: allowed GET /api/judges/refresh"},
	}

	for _, tc := range tests {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Errorf("%s: got HTTP %d, want %d", tc.label, rec.Code, tc.want)
		}
	}
}

// TestGuestModeGuardUnknownRouteDenies verifies that a route absent from both
// policy maps is denied with 403 rather than accidentally allowed. This is the
// defence-in-depth fallback for routes that somehow bypass the startup panic.
func TestGuestModeGuardUnknownRouteDenies(t *testing.T) {
	noop := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	guard := NewGuestModeGuard()

	r := chi.NewRouter()
	r.Use(guard)
	r.Get("/api/unlisted-route", noop) // not in either map

	req := httptest.NewRequest(http.MethodGet, "/api/unlisted-route", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("unlisted route: got HTTP %d, want 403", rec.Code)
	}
}
