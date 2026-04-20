//go:build !webserver

package api

import "github.com/go-chi/chi/v5"

// registerSPAHandler is a no-op for non-webserver builds.
// The embedded React SPA is only served in the webserver build (see web_handler.go).
// Electron and dev-mode builds serve the frontend through their own mechanisms.
func registerSPAHandler(_ chi.Router) {}
