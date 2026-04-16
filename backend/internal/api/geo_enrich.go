package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/proxyscrape/checker-backend/internal/geoworker"
	"github.com/proxyscrape/checker-backend/internal/store"
)

// enrichedRow is the per-row payload sent to the renderer after each batch
// so it can patch geo fields in the Redux result store without a full reload.
type enrichedRow struct {
	Host        string `json:"host"`
	CountryCode string `json:"countryCode"`
	CountryName string `json:"countryName"`
	CountryFlag string `json:"countryFlag"`
	City        string `json:"city"`
}

// enrichState tracks a running enrichment job. Only one can run at a time.
// mu protects cancel and recentRows; the atomic fields are self-synchronising.
type enrichState struct {
	mu          sync.Mutex
	cancel      context.CancelFunc
	recentRows  []enrichedRow // rows updated since last SSE tick; drained per tick
	total       atomic.Int64
	done        atomic.Int64
	running     atomic.Bool
}

// appendRows appends enriched rows under the lock.
func (e *enrichState) appendRows(rows []enrichedRow) {
	e.mu.Lock()
	e.recentRows = append(e.recentRows, rows...)
	e.mu.Unlock()
}

// drainRows atomically returns and clears the accumulated rows.
func (e *enrichState) drainRows() []enrichedRow {
	e.mu.Lock()
	rows := e.recentRows
	e.recentRows = nil
	e.mu.Unlock()
	return rows
}

var globalEnrich enrichState

func (e *enrichState) storeCancel(fn context.CancelFunc) {
	e.mu.Lock()
	e.cancel = fn
	e.mu.Unlock()
}

func (e *enrichState) callAndClearCancel() {
	e.mu.Lock()
	fn := e.cancel
	e.cancel = nil
	e.mu.Unlock()
	if fn != nil {
		fn()
	}
}

// handleGeoEnrichStart starts background geo enrichment for all check_results
// rows where geo_status = 'pending'. Only one enrichment job runs at a time.
// POST /api/geo/enrich
func (s *server) handleGeoEnrichStart(w http.ResponseWriter, r *http.Request) {
	if !globalEnrich.running.CompareAndSwap(false, true) {
		writeJSON(w, map[string]interface{}{"status": "already_running"})
		return
	}

	// Count pending rows.
	var total int64
	if err := s.store.DB().QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM check_results WHERE geo_status = 'pending'`,
	).Scan(&total); err != nil {
		globalEnrich.running.Store(false)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if total == 0 {
		globalEnrich.running.Store(false)
		writeJSON(w, map[string]interface{}{"status": "nothing_to_enrich"})
		return
	}

	globalEnrich.total.Store(total)
	globalEnrich.done.Store(0)

	ctx, cancel := context.WithCancel(context.Background())
	globalEnrich.storeCancel(cancel)

	go runGeoEnrichmentWorker(ctx, s.store, s.geoWorker)

	writeJSON(w, map[string]interface{}{"status": "started", "total": total})
}

// handleGeoEnrichCancel stops any running enrichment job.
// DELETE /api/geo/enrich
func (s *server) handleGeoEnrichCancel(w http.ResponseWriter, r *http.Request) {
	globalEnrich.callAndClearCancel()
	writeJSON(w, map[string]interface{}{"status": "cancelled"})
}

// handleGeoEnrichStatus returns current enrichment progress.
// GET /api/geo/enrich
func (s *server) handleGeoEnrichStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]interface{}{
		"running": globalEnrich.running.Load(),
		"total":   globalEnrich.total.Load(),
		"done":    globalEnrich.done.Load(),
	})
}

// handleGeoEnrichEvents streams enrichment progress as SSE.
// GET /api/geo/enrich/events
func (s *server) handleGeoEnrichEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			running := globalEnrich.running.Load()
			total := globalEnrich.total.Load()
			done := globalEnrich.done.Load()
			updated := globalEnrich.drainRows() // nil → omitted from JSON

			payload := map[string]interface{}{
				"running": running,
				"total":   total,
				"done":    done,
			}
			if len(updated) > 0 {
				payload["updated"] = updated
			}

			data, _ := json.Marshal(payload)
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			if !running {
				return
			}
		}
	}
}

// runGeoEnrichmentWorker enriches all pending rows by calling the ip-geo
// Cloudflare Worker instead of the local MMDB.  All pending hosts are
// collected in one query and sent to the worker in a single call (the worker
// fans them out to ip-api internally).  No artificial rate limiting is needed
// since the worker handles batching.
func runGeoEnrichmentWorker(ctx context.Context, st *store.Store, client *geoworker.Client) {
	defer func() {
		globalEnrich.running.Store(false)
		globalEnrich.callAndClearCancel()
	}()

	// Fetch all pending rows at once — no need to loop in batches since the
	// worker accepts up to 10,000 IPs per call and handles the rest internally.
	rows, err := st.DB().QueryContext(ctx,
		`SELECT id, host FROM check_results WHERE geo_status = 'pending'`,
	)
	if err != nil {
		log.Printf("geo enrich worker: query: %v", err)
		return
	}

	type pendingRow struct{ id, host string }
	var pending []pendingRow
	hosts := make([]string, 0)
	for rows.Next() {
		var r pendingRow
		if err := rows.Scan(&r.id, &r.host); err == nil {
			pending = append(pending, r)
			hosts = append(hosts, r.host)
		}
	}
	if err := rows.Err(); err != nil {
		log.Printf("geo enrich worker: scan: %v", err)
	}
	rows.Close()

	if len(pending) == 0 {
		return
	}

	// Call the worker — one HTTP round-trip for all IPs.
	results, err := client.LookupBatch(ctx, hosts)
	if err != nil {
		log.Printf("geo enrich worker: lookup: %v", err)
		return
	}

	// Index results by host for O(1) matching.
	byHost := make(map[string]geoworker.Result, len(results))
	for _, r := range results {
		byHost[r.Host] = r
	}

	// Persist and stream updates in DB-friendly chunks.
	const dbBatch = 500
	for i := 0; i < len(pending); i += dbBatch {
		select {
		case <-ctx.Done():
			return
		default:
		}

		end := i + dbBatch
		if end > len(pending) {
			end = len(pending)
		}
		chunk := pending[i:end]

		tx, err := st.DB().BeginTx(ctx, nil)
		if err != nil {
			log.Printf("geo enrich worker: begin tx: %v", err)
			return
		}

		enriched := make([]enrichedRow, 0, len(chunk))
		for _, p := range chunk {
			r := byHost[p.host]
			if _, err := tx.ExecContext(ctx,
				`UPDATE check_results
				 SET country_code = ?, country_name = ?, country_flag = ?, city = ?, geo_status = 'done'
				 WHERE id = ?`,
				r.CountryCode, r.CountryName, r.CountryFlag, r.City, p.id,
			); err != nil {
				_ = tx.Rollback()
				log.Printf("geo enrich worker: update: %v", err)
				return
			}
			enriched = append(enriched, enrichedRow{
				Host:        p.host,
				CountryCode: r.CountryCode,
				CountryName: r.CountryName,
				CountryFlag: r.CountryFlag,
				City:        r.City,
			})
		}

		if err := tx.Commit(); err != nil {
			log.Printf("geo enrich worker: commit: %v", err)
			return
		}

		globalEnrich.appendRows(enriched)
		globalEnrich.done.Add(int64(len(chunk)))
	}
}
