//go:build webserver

package api

import "net/http"

// handleTraceStatus always reports that packet capture is unavailable in the
// webserver build. The webserver binary is compiled without CGO / libpcap, so
// trace capture is a desktop-only feature.
func (s *server) handleTraceStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"available": false,
		"reason":    "not_supported",
	})
}
