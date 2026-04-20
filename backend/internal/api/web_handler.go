//go:build webserver

package api

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
)

//go:embed all:web
var webFS embed.FS

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
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback — unknown paths are handled by React Router client-side.
		r2 := r.Clone(r.Context())
		r2.URL.Path = "/"
		fileServer.ServeHTTP(w, r2)
	})
}
