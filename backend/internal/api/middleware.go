package api

import (
	"context"
	"net/http"
	"strings"
)

// TokenVerifier validates a bearer token for authenticated routes.
type TokenVerifier func(ctx context.Context, token string) bool

// extractBearer parses a Bearer token from the Authorization header.
// Returns an empty string if the header is absent or malformed.
func extractBearer(r *http.Request) string {
	raw := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if !strings.HasPrefix(raw, prefix) {
		return ""
	}
	return strings.TrimSpace(raw[len(prefix):])
}

// tokenFromRequest extracts a Bearer token from the Authorization header,
// falling back to the ?token= query parameter for browser EventSource clients
// that cannot set custom request headers.
func tokenFromRequest(r *http.Request) string {
	if t := extractBearer(r); t != "" {
		return t
	}
	return r.URL.Query().Get("token")
}

// NewAuthMiddleware returns middleware that requires a valid
// Authorization: Bearer <token> header. Use for all REST endpoints.
// Mode-specific logic lives only in verify.
func NewAuthMiddleware(verify TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearer(r)
			if token == "" || !verify(r.Context(), token) {
				jsonUnauthorized(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// NewSSEAuthMiddleware returns middleware that accepts a Bearer token from
// the Authorization header OR the ?token= query parameter.
//
// The query-parameter fallback is required for browser EventSource clients,
// which cannot set custom headers. Use this middleware for all SSE endpoints
// instead of NewAuthMiddleware.
func NewSSEAuthMiddleware(verify TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := tokenFromRequest(r)
			if token == "" || !verify(r.Context(), token) {
				jsonUnauthorized(w)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func jsonUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
