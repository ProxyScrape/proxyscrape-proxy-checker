//go:build webserver

package api

import (
	"embed"
	"io/fs"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Vite content-hashes static assets with an 8-character hex suffix, e.g.
// "assets/index-DuijEYuQ.js". These are safe to cache forever.
var hashedAssetRe = regexp.MustCompile(`-[A-Za-z0-9]{8}\.[a-z0-9]+$`)

//go:embed all:web
var webFS embed.FS

func isHashedAsset(path string) bool {
	return hashedAssetRe.MatchString(path)
}

// registerSPAHandler mounts the embedded React SPA on the router.
//
// Static assets (JS, CSS, fonts, images) are served directly from the embedded
// FS. Any path that does not match an embedded file falls back to index.html so
// that React Router can handle client-side navigation.
//
// /api/* routes registered before this handler always take priority in chi.
func registerSPAHandler(r chi.Router) {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		panic("web embed: " + err.Error())
	}

	fileServer := http.FileServer(http.FS(sub))

	r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Serve the file if it exists in the embedded FS.
		if f, err := sub.Open(path); err == nil {
			f.Close()
			// Hashed assets (e.g. index-abc123.js) are content-addressed and
			// safe to cache indefinitely. index.html and the SPA fallback must
			// never be cached so browsers always fetch the latest entry point.
			if isHashedAsset(path) {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback — unknown paths are handled by React Router client-side.
		w.Header().Set("Cache-Control", "no-cache")
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	})
}
