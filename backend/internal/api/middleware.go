package api

import (
	"context"
	"net/http"
	"strings"
)

// TokenVerifier validates a bearer token for authenticated routes.
type TokenVerifier func(ctx context.Context, token string) bool

// NewAuthMiddleware returns middleware that requires a valid
// Authorization: Bearer <token> header. Mode-specific logic lives only in verify.
func NewAuthMiddleware(verify TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("Authorization")
			const prefix = "Bearer "
			if !strings.HasPrefix(raw, prefix) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}
			token := strings.TrimSpace(raw[len(prefix):])
			if token == "" || !verify(r.Context(), token) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
