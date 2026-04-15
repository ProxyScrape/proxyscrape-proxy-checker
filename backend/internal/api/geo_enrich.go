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

	"github.com/proxyscrape/checker-backend/internal/geo"
	"github.com/proxyscrape/checker-backend/internal/store"
)

// enrichState tracks a running enrichment job. Only one can run at a time.
// The mu field protects cancel; the atomic fields are self-synchronising.
type enrichState struct {
	mu      sync.Mutex
	cancel  context.CancelFunc
	total   atomic.Int64
	done    atomic.Int64
	running atomic.Bool
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

	go runGeoEnrichment(ctx, s.store, s.geoDB)

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

			data, _ := json.Marshal(map[string]interface{}{
				"running": running,
				"total":   total,
				"done":    done,
			})
			_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()

			if !running {
				return
			}
		}
	}
}

// runGeoEnrichment processes pending rows in batches.
// Rate-limited to ~500 rows/second to avoid starving active checks.
func runGeoEnrichment(ctx context.Context, st *store.Store, geoDB *geo.DB) {
	defer func() {
		globalEnrich.running.Store(false)
		globalEnrich.callAndClearCancel()
	}()

	const batchSize = 100
	// ~500 rows/s: process 100 rows, sleep 200ms → average 500/s
	const sleepBetweenBatches = 200 * time.Millisecond

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		rows, err := st.DB().QueryContext(ctx,
			`SELECT id, host FROM check_results WHERE geo_status = 'pending' LIMIT ?`,
			batchSize,
		)
		if err != nil {
			log.Printf("geo enrich: query batch: %v", err)
			return
		}

		type row struct{ id, host string }
		var batch []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.id, &r.host); err == nil {
				batch = append(batch, r)
			}
		}
		if err := rows.Err(); err != nil {
			log.Printf("geo enrich: scan batch: %v", err)
		}
		rows.Close()

		if len(batch) == 0 {
			return
		}

		type update struct {
			id          string
			countryCode string
			countryName string
			countryFlag string
			city        string
		}
		updates := make([]update, 0, len(batch))
		for _, r := range batch {
			country, city := geoDB.Lookup(r.host)
			updates = append(updates, update{
				id:          r.id,
				countryCode: country.Code,
				countryName: country.Name,
				countryFlag: country.Flag,
				city:        city,
			})
		}

		tx, err := st.DB().BeginTx(ctx, nil)
		if err != nil {
			log.Printf("geo enrich: begin tx: %v", err)
			return
		}
		for _, u := range updates {
			if _, err := tx.ExecContext(ctx,
				`UPDATE check_results
				 SET country_code = ?, country_name = ?, country_flag = ?, city = ?, geo_status = 'done'
				 WHERE id = ?`,
				u.countryCode, u.countryName, u.countryFlag, u.city, u.id,
			); err != nil {
				_ = tx.Rollback()
				log.Printf("geo enrich: update row: %v", err)
				return
			}
		}
		if err := tx.Commit(); err != nil {
			log.Printf("geo enrich: commit: %v", err)
			return
		}

		globalEnrich.done.Add(int64(len(batch)))

		select {
		case <-ctx.Done():
			return
		case <-time.After(sleepBetweenBatches):
		}
	}
}
