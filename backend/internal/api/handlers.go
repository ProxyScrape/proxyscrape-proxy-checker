package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	mrand "math/rand"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/gopacket/pcap"
	"github.com/google/uuid"
	"github.com/proxyscrape/checker-backend/internal/blacklist"
	"github.com/proxyscrape/checker-backend/internal/checker"
	"github.com/proxyscrape/checker-backend/internal/geoworker"
	"github.com/proxyscrape/checker-backend/internal/ip"
	"github.com/proxyscrape/checker-backend/internal/judges"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
	"github.com/proxyscrape/checker-backend/internal/updater"
	"golang.org/x/crypto/bcrypt"
)

// runningCheck holds live state for an in-progress proxy check.
type runningCheck struct {
	cancel context.CancelFunc

	// mu guards snapshot. The tee goroutine holds a write lock while appending;
	// SSE handlers hold a read lock while copying a batch to send.
	mu       sync.RWMutex
	snapshot []checker.Result // append-only; one entry per checked proxy; survives client disconnects
	// newItem is a 1-buffered channel used by the tee goroutine to wake SSE
	// readers. It is closed when the tee goroutine finishes, signalling that no
	// more results will be added to snapshot.
	newItem chan struct{}

	// geoResults is written by the check goroutine after geo enrichment
	// completes and before close(rc.done). SSE handlers read it after
	// receiving from rc.done. No mutex needed: the happens-before relationship
	// through close/receive on rc.done is sufficient.
	geoResults []geoworker.Result

	progress  chan checker.Progress // passed to checker.Run; SSE reads from here
	done      chan struct{}         // closed after check goroutine fully finishes (store saved + geo enriched)
	cancelled int32                // atomic; 1 when user requested cancellation via DELETE /check/{id}, 0 on natural finish
	// sessionID is non-empty in guest mode; used to prevent cross-session SSE access.
	sessionID string
	// total is the number of proxies in this check run; used in guest mode to
	// decrement the global in-flight counter when the check finishes.
	total int
}

// guestSessionCounter returns the in-flight proxy counter for the given guest
// session, creating it on first access. Safe for concurrent use.
func (s *server) guestSessionCounter(sid string) *atomic.Int64 {
	v, _ := s.guestSessionInFlight.LoadOrStore(sid, &atomic.Int64{})
	return v.(*atomic.Int64)
}

// --- Request/response types for POST /api/check ---

type startCheckReq struct {
	Proxies          []proxyInput `json:"proxies"`
	Protocols        []string     `json:"protocols"`
	Threads          int          `json:"threads"`
	Timeout          int          `json:"timeout"`
	Retries          int          `json:"retries"`
	JudgeURLs        []judgeInput `json:"judgeUrls"`
	BlacklistSources []blInput    `json:"blacklistSources"`
	MyIP             string       `json:"myIP"`
	KeepAlive        bool         `json:"keepAlive"`
	CaptureServer    bool         `json:"captureServer"`
	CaptureFullData  bool         `json:"captureFullData"`
	CaptureTrace     bool         `json:"captureTrace"`
	Shuffle          bool         `json:"shuffle"`
	LocalDNS         bool         `json:"localDns"`
}

type proxyInput struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Auth     string `json:"auth"`     // "none" or "user:pass"
	Protocol string `json:"protocol"` // declared protocol from import ("http", "socks5", etc.) or ""
}

type judgeInput struct {
	URL      string `json:"url"`
	Validate string `json:"validate"`
	Active   bool   `json:"active"`
}

type blInput struct {
	Title string `json:"title"`
	Path  string `json:"path"`
}

// =============================================================================
// Auth
// =============================================================================

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := s.store.GetUserByUsername(r.Context(), req.Username)
	if err != nil {
		log.Printf("login: get user: %v", err)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}
	// No users = desktop mode, or user not found = 401.
	if user == nil {
		jsonError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		jsonError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token := uuid.New().String()
	expiresAt := time.Now().Add(24 * time.Hour)
	if err := s.store.CreateSession(r.Context(), token, user.ID, expiresAt); err != nil {
		log.Printf("login: create session: %v", err)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, map[string]string{
		"token":     token,
		"expiresAt": expiresAt.UTC().Format(time.RFC3339),
	})
}

// =============================================================================
// Proxy check — start
// =============================================================================

func (s *server) handleStartCheck(w http.ResponseWriter, r *http.Request) {
	var req startCheckReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Proxies) == 0 {
		jsonError(w, http.StatusBadRequest, "no proxies provided")
		return
	}
	if len(req.Protocols) == 0 {
		jsonError(w, http.StatusBadRequest, "no protocols provided")
		return
	}

	// Enforce the per-session in-flight proxy limit for guest mode.
	if s.mode == "guest" && s.guestInFlightLimit > 0 {
		sid := guestSessionIDFromCtx(r.Context())
		incoming := int64(len(req.Proxies))
		counter := s.guestSessionCounter(sid)
		if counter.Add(incoming) > int64(s.guestInFlightLimit) {
			counter.Add(-incoming)
			jsonError(w, http.StatusTooManyRequests, "Too many proxies being checked at once — wait for your current runs to finish.")
			return
		}
	}

	// Build judge items; fall back to settings if the request provides none.
	judgeItems := make([]judges.JudgeItem, len(req.JudgeURLs))
	for i, it := range req.JudgeURLs {
		judgeItems[i] = judges.JudgeItem{URL: it.URL, Validate: it.Validate, Active: it.Active}
	}
	if len(judgeItems) == 0 {
		cfg := s.settings.Get()
		judgeItems = make([]judges.JudgeItem, len(cfg.Judges.Items))
		for i, it := range cfg.Judges.Items {
			judgeItems[i] = judges.JudgeItem{URL: it.URL, Validate: it.Validate, Active: it.Active}
		}
	}

	// Use the cached judge set from the most recent /api/judges/refresh if it exists.
	// The frontend calls refresh before starting a check, so this avoids a second round
	// of pinging the same judges and gives sub-second check startup.
	s.mu.RLock()
	cachedJudges := s.judges
	s.mu.RUnlock()

	var j *judges.Judges
	if cachedJudges != nil {
		log.Printf("[check] using cached judge set (%d judges)", len(judgeItems))
		j = cachedJudges
	} else {
		log.Printf("[check] no cached judges — pinging %d judges for protocols %v", len(judgeItems), req.Protocols)
		for _, it := range judgeItems {
			log.Printf("[check]   judge: active=%v %s", it.Active, it.URL)
		}

		judgeCtx, judgeCancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer judgeCancel()

		var err error
		cfg := s.settings.Get()
		j, err = judges.New(judgeCtx, judgeItems, req.Protocols, cfg.Judges.Swap)
		if err != nil {
			log.Printf("[check] judge init failed: %v", err)
			jsonError(w, http.StatusBadRequest, fmt.Sprintf("judges: %v", err))
			return
		}
	}

	// Load blacklists if provided.
	var bl *blacklist.Blacklist
	if len(req.BlacklistSources) > 0 {
		blItems := make([]blacklist.Item, len(req.BlacklistSources))
		for i, it := range req.BlacklistSources {
			blItems[i] = blacklist.Item{Title: it.Title, Path: it.Path}
		}
		bl, _ = blacklist.New(r.Context(), blItems)
	}

	// Resolve public IP.
	myIP := strings.TrimSpace(req.MyIP)
	if myIP == "" {
		cfg := s.settings.Get()
		if fetched, ferr := ip.GetPublicIP(r.Context(), cfg.IP.LookupURL); ferr != nil {
			log.Printf("start check: get public IP: %v", ferr)
		} else {
			myIP = strings.TrimSpace(fetched)
		}
	}

	// Build checker proxies.
	proxies := make([]checker.Proxy, len(req.Proxies))
	for i, p := range req.Proxies {
		auth := p.Auth
		if auth == "" {
			auth = "none"
		}
		proxies[i] = checker.Proxy{Host: p.Host, Port: p.Port, Auth: auth, Protocol: p.Protocol}
	}

	// Optional shuffle.
	if req.Shuffle {
		for i := len(proxies) - 1; i > 0; i-- {
			n := mrand.Intn(i + 1)
			proxies[i], proxies[n] = proxies[n], proxies[i]
		}
	}

	opts := checker.Options{
		Timeout:         req.Timeout,
		Threads:         req.Threads,
		Retries:         req.Retries,
		KeepAlive:       req.KeepAlive,
		CaptureServer:   req.CaptureServer,
		CaptureFullData: req.CaptureFullData,
		CaptureTrace:    req.CaptureTrace,
		LocalDNS:        req.LocalDNS,
	}

	c := checker.New(proxies, opts, myIP, j, req.Protocols, bl)

	checkID := uuid.New().String()
	ctx, cancel := context.WithCancel(context.Background())
	sessionID := guestSessionIDFromCtx(r.Context())

	rc := &runningCheck{
		cancel:    cancel,
		snapshot:  make([]checker.Result, 0, len(proxies)),
		newItem:   make(chan struct{}, 1),
		progress:  make(chan checker.Progress, 100),
		done:      make(chan struct{}),
		sessionID: sessionID,
		total:     len(proxies),
	}
	s.checks.Store(checkID, rc)

	// Snapshot values needed inside the goroutine closure.
	protocols := append([]string(nil), req.Protocols...)
	timeout := int64(req.Timeout)
	total := len(proxies)

	go func() {
		defer s.checks.Delete(checkID)
		defer cancel()
		defer close(rc.done)
		if s.mode == "guest" && s.guestInFlightLimit > 0 {
			defer s.guestSessionCounter(rc.sessionID).Add(-int64(rc.total))
		}

		startTime := time.Now()

		// rawCh is what checker.Run writes to; tee goroutine fans it out to the
		// in-memory snapshot and wakes any connected SSE handler.
		rawCh := make(chan checker.Result, total)

		teeDone := make(chan struct{})

		go func() {
			defer close(teeDone)
			defer close(rc.newItem) // signals SSE readers that no more results are coming
			for result := range rawCh {
				rc.mu.Lock()
				rc.snapshot = append(rc.snapshot, result)
				rc.mu.Unlock()
				// Wake any waiting SSE reader. Non-blocking: if a notification
				// is already pending the reader will drain the new item on its
				// next pass, so dropping the signal here is safe.
				select {
				case rc.newItem <- struct{}{}:
				default:
				}
			}
		}()

		_ = c.Run(ctx, rawCh, rc.progress)
		<-teeDone // snapshot is complete; no lock needed (only reader from here)

		elapsed := time.Since(startTime).Milliseconds()

		working := 0
		var workingHosts []string
		storeResults := make([]store.CheckResult, len(rc.snapshot))
		for i, res := range rc.snapshot {
			if res.Status == "working" {
				working++
				if res.Proxy.Host != "" {
					workingHosts = append(workingHosts, res.Proxy.Host)
				}
			}
			storeResults[i] = resultToStore(checkID, res)
		}

		bgCtx := context.Background()
		saved, saveErr := s.store.SaveCheck(bgCtx, store.Check{
			ID:         checkID,
			CreatedAt:  time.Now(),
			Total:      total,
			Working:    working,
			TimeoutMs:  timeout,
			DurationMs: elapsed,
			Protocols:  protocols,
			SessionID:  sessionID,
		})
		if saveErr != nil {
			log.Printf("save check %s: %v", checkID, saveErr)
		}
		// Only persist results when the parent check row was actually inserted.
		// For guest mode, saved==false means the session expired mid-run and
		// was already pruned — discarding results here avoids orphaned rows.
		if saved {
			if saveErr := s.store.SaveCheckResults(bgCtx, storeResults); saveErr != nil {
				log.Printf("save check results %s: %v", checkID, saveErr)
			}
		}

		// Geo enrichment runs here — inside the check goroutine and before
		// close(rc.done) — so that rc.geoResults is written exactly once and
		// every SSE client (including reconnecting ones) sees the same data
		// after receiving from rc.done. bgCtx ensures enrichment always runs
		// to completion regardless of whether any SSE client is connected.
		if s.geoWorker != nil && len(workingHosts) > 0 {
			geoRes, err := s.geoWorker.LookupBatch(bgCtx, workingHosts)
			if err != nil {
				log.Printf("[geoworker] enrichment %s: %v", checkID, err)
			} else {
				inlineUpdateGeo(s.store.DB(), checkID, geoRes)
				rc.geoResults = geoRes
			}
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": checkID})
}

// apiResultProxy is the nested proxy object in apiResult, matching checker.Result JSON shape.
type apiResultProxy struct {
	Host string `json:"host"`
	Port int    `json:"port"`
	Auth string `json:"auth"`
}

// apiResultCountry mirrors geo.Country JSON shape.
type apiResultCountry struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Flag string `json:"flag"`
}

// apiResult is the JSON shape sent to the frontend for every proxy result,
// whether live (via SSE) or replayed from the store. It must match the shape
// that mapResultItem() in CheckingActions.js and viewPastCheck() in HistoryActions.js expect.
type apiResult struct {
	Proxy     apiResultProxy                   `json:"proxy"`
	Status    string                           `json:"status"`
	Protocols []string                         `json:"protocols"`
	Anon      string                           `json:"anon"`
	TimeoutMs int64                            `json:"timeoutMs"`
	Country   apiResultCountry                 `json:"country"`
	City      string                           `json:"city"`
	Blacklist []string                         `json:"blacklist"`
	Errors    map[string]string                `json:"errors"`
	Server    string                           `json:"server,omitempty"`
	KeepAlive bool                             `json:"keepAlive,omitempty"`
	Traces    map[string][]checker.TraceEvent  `json:"traces,omitempty"`
	FullData  map[string]checker.ProtoFullData `json:"fullData,omitempty"`
	GeoStatus string                           `json:"geoStatus,omitempty"`
}

// geoStatusForResult derives the geo_status to store for a freshly-checked proxy.
//
//   - "skipped"  – failed or cancelled proxies: geo lookup is never attempted
//                  during checking (proxyIP is only set for working proxies), so
//                  there is no country data to store and enrichment would gain
//                  nothing meaningful.
//   - "pending"  – working proxy without a country code yet; the geo enrichment
//                  worker will fill it in after the check completes.
//   - "done"     – working proxy with a country code already populated.
func geoStatusForResult(proxyStatus, countryCode string) string {
	if proxyStatus == "failed" || proxyStatus == "cancelled" {
		return "skipped"
	}
	if countryCode == "" {
		return "pending"
	}
	return "done"
}

// storeResultToAPI converts a flat store.CheckResult to the nested apiResult shape.
func storeResultToAPI(r store.CheckResult) apiResult {
	protocols := r.Protocols
	if protocols == nil {
		protocols = []string{}
	}
	blacklists := r.Blacklists
	if blacklists == nil {
		blacklists = []string{}
	}
	errors := r.Errors
	if errors == nil {
		errors = map[string]string{}
	}
	var traces map[string][]checker.TraceEvent
	if r.TracesJSON != "" {
		_ = json.Unmarshal([]byte(r.TracesJSON), &traces)
	}
	var fullData map[string]checker.ProtoFullData
	if r.FullDataJSON != "" {
		_ = json.Unmarshal([]byte(r.FullDataJSON), &fullData)
	}
	return apiResult{
		Proxy:     apiResultProxy{Host: r.Host, Port: r.Port, Auth: r.Auth},
		Status:    r.Status,
		Protocols: protocols,
		Anon:      r.Anon,
		TimeoutMs: r.TimeoutMs,
		Country:   apiResultCountry{Code: r.CountryCode, Name: r.CountryName, Flag: r.CountryFlag},
		City:      r.City,
		Blacklist: blacklists,
		Errors:    errors,
		Server:    r.Server,
		KeepAlive: r.KeepAlive,
		Traces:    traces,
		FullData:  fullData,
		GeoStatus: r.GeoStatus,
	}
}

// resultToAPI converts a live checker.Result to the apiResult wire shape.
func resultToAPI(r checker.Result) apiResult {
	protocols := r.Protocols
	if protocols == nil {
		protocols = []string{}
	}
	blacklists := r.Blacklists
	if blacklists == nil {
		blacklists = []string{}
	}
	errors := r.Errors
	if errors == nil {
		errors = map[string]string{}
	}
	return apiResult{
		Proxy:     apiResultProxy{Host: r.Proxy.Host, Port: r.Proxy.Port, Auth: r.Proxy.Auth},
		Status:    r.Status,
		Protocols: protocols,
		Anon:      r.Anon,
		TimeoutMs: r.TimeoutMs,
		Country:   apiResultCountry{Code: r.Country.Code, Name: r.Country.Name, Flag: r.Country.Flag},
		City:      r.City,
		Blacklist: blacklists,
		Errors:    errors,
		Server:    r.Server,
		KeepAlive: r.KeepAlive,
		Traces:    r.Traces,
		FullData:  r.FullData,
		GeoStatus: geoStatusForResult(r.Status, r.Country.Code),
	}
}

// resultToStore maps a checker.Result to a store.CheckResult.
func resultToStore(checkID string, r checker.Result) store.CheckResult {
	protocols := r.Protocols
	if protocols == nil {
		protocols = []string{}
	}
	blists := r.Blacklists
	if blists == nil {
		blists = []string{}
	}
	return store.CheckResult{
		ID:           uuid.New().String(),
		CheckID:      checkID,
		Host:         r.Proxy.Host,
		Port:         r.Proxy.Port,
		Auth:         r.Proxy.Auth,
		Status:       r.Status,
		Protocols:    protocols,
		Anon:         r.Anon,
		TimeoutMs:    r.TimeoutMs,
		CountryCode:  r.Country.Code,
		CountryName:  r.Country.Name,
		CountryFlag:  r.Country.Flag,
		City:         r.City,
		Blacklists:   blists,
		Errors:       r.Errors,
		Server:       r.Server,
		KeepAlive:    r.KeepAlive,
		TracesJSON:   marshalJSON(r.Traces),
		FullDataJSON: marshalJSON(r.FullData),
		GeoStatus:    geoStatusForResult(r.Status, r.Country.Code),
	}
}

func marshalJSON(v interface{}) string {
	if v == nil {
		return ""
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// =============================================================================
// Proxy check — SSE event stream
// =============================================================================

func (s *server) handleCheckEvents(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// In guest mode verify that this check belongs to the requesting session
	// before emitting any events. We check both the in-flight runningCheck
	// (not yet persisted) and the stored record.
	if s.mode == "guest" {
		sid := guestSessionIDFromCtx(r.Context())
		if v, ok := s.checks.Load(id); ok {
			rc := v.(*runningCheck)
			if rc.sessionID != sid {
				jsonUnauthorized(w)
				return
			}
		} else {
			// Check might be fully stored already.
			ok, err := s.store.CheckBelongsToSession(r.Context(), id, sid)
			if err != nil {
				log.Printf("check events ownership: %v", err)
				jsonError(w, http.StatusInternalServerError, "internal error")
				return
			}
			if !ok {
				jsonUnauthorized(w)
				return
			}
		}
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	// Stream live events if the check is still running.
	if v, ok := s.checks.Load(id); ok {
		rc := v.(*runningCheck)
		s.streamLiveEvents(w, r, rc, id)
		return
	}

	// Check is finished (or never existed); send stored results.
	s.sendStoredResults(w, r, id)
}

// streamLiveEvents streams results and progress for an active check to the
// client until the check completes or the client disconnects.
//
// It reads from rc.snapshot by index rather than consuming a channel, so
// multiple concurrent SSE connections (e.g. reconnects) can each read the full
// result history independently. The tee goroutine signals rc.newItem whenever
// a new result is appended, and closes it when no more results will arrive.
//
// On initial connect nextIdx=0 so the client gets everything from the start.
// On reconnect nextIdx=0 equally, so the full snapshot is replayed first —
// giving the client all results it missed while disconnected.
//
// Progress events with a done count below the number of results already
// delivered are skipped to avoid the reconnecting client's counter going
// backwards (stale events may still be buffered in rc.progress).
//
// Geo enrichment is performed by the check goroutine before close(rc.done),
// so rc.geoResults is already populated when finalize reads it. This means
// every SSE client — regardless of when it connected — receives the same
// geo-batch data, and enrichment always runs exactly once.
func (s *server) streamLiveEvents(w http.ResponseWriter, r *http.Request, rc *runningCheck, checkID string) {
	progressCh := rc.progress
	nextIdx := 0 // number of snapshot entries already sent to this client

	// Collect working proxy hosts for geo enrichment after the check finishes.
	var workingHosts []string

	// drainSnapshot copies and sends any snapshot entries not yet delivered to
	// this client. Called on every newItem notification and once before the
	// select loop to replay historical results for reconnecting clients.
	drainSnapshot := func() {
		rc.mu.RLock()
		batch := make([]checker.Result, len(rc.snapshot)-nextIdx)
		copy(batch, rc.snapshot[nextIdx:])
		rc.mu.RUnlock()

		for _, result := range batch {
			writeSSEEvent(w, "result", resultToAPI(result))
			if result.Status == "working" && result.Proxy.Host != "" {
				workingHosts = append(workingHosts, result.Proxy.Host)
			}
			nextIdx++
		}
	}

	// Replay any results already in the snapshot. On a fresh connect this is a
	// no-op; on reconnect it catches the client up instantly.
	drainSnapshot()

	finalize := func() {
		// Send "enriching" before blocking — the spinner should be visible while
		// the check goroutine runs geo enrichment. We predict enrichment will
		// happen if the geo worker is configured and the check produced working
		// proxies; this is the same condition the goroutine uses.
		if s.geoWorker != nil && len(workingHosts) > 0 {
			writeSSEEvent(w, "enriching", map[string]string{"message": "Enriching location data"})
		}

		// Wait for the check goroutine to finish: SQLite persist + geo enrichment.
		// rc.geoResults is safe to read without a lock after this receive because
		// the goroutine writes it before close(rc.done) (happens-before).
		select {
		case <-rc.done:
		case <-r.Context().Done():
			return
		}

		// Forward the geo results written by the check goroutine. Every SSE
		// client — including reconnecting ones — sees the same enriched data.
		if len(rc.geoResults) > 0 {
			enriched := make([]enrichedRow, 0, len(rc.geoResults))
			for _, gr := range rc.geoResults {
				enriched = append(enriched, enrichedRow{
					Host:        gr.Host,
					CountryCode: gr.CountryCode,
					CountryName: gr.CountryName,
					CountryFlag: gr.CountryFlag,
					City:        gr.City,
				})
			}
			writeSSEEvent(w, "geo-batch", map[string]interface{}{"results": enriched})
		}

		// "complete" = all proxies were checked naturally.
		// "stopped"  = user cancelled the run mid-way via DELETE /check/{id}.
		if atomic.LoadInt32(&rc.cancelled) == 1 {
			writeSSEEvent(w, "stopped", map[string]string{"status": "stopped"})
		} else {
			writeSSEEvent(w, "complete", map[string]string{"status": "complete"})
		}
	}

	for {
		select {
		case _, ok := <-rc.newItem:
			// Always drain after a newItem signal: the notification may have been
			// coalesced (dropped when the buffer was full), so there could be
			// more entries in snapshot than a single item.
			drainSnapshot()
			if !ok {
				// Tee goroutine finished — no more results will be written.
				finalize()
				return
			}

		case prog, ok := <-progressCh:
			if !ok {
				// Set to nil so this case is never selected again.
				progressCh = nil
			} else if prog.Done >= nextIdx {
				// Skip stale progress events (done count below what has already
				// been delivered from the snapshot) to prevent the reconnecting
				// client's counter from jumping backwards.
				writeSSEEvent(w, "progress", prog)
			}

		case <-r.Context().Done():
			return
		}
	}
}

// handleActiveCheck returns the currently running check for the requesting guest
// session (HTTP 200 + JSON), or 204 No Content when no check is in flight.
//
// Security: it only exposes checks whose sessionID matches the cookie-authenticated
// session from the request context. A guest cannot discover or connect to another
// session's check even if they know or guess its UUID.
func (s *server) handleActiveCheck(w http.ResponseWriter, r *http.Request) {
	sid := guestSessionIDFromCtx(r.Context())

	type activeCheckResp struct {
		ID    string `json:"id"`
		Total int    `json:"total"`
		Done  int    `json:"done"`
	}

	var found *activeCheckResp
	s.checks.Range(func(k, v interface{}) bool {
		rc := v.(*runningCheck)
		if rc.sessionID != sid {
			return true // not ours — keep ranging
		}
		rc.mu.RLock()
		done := len(rc.snapshot)
		rc.mu.RUnlock()
		found = &activeCheckResp{
			ID:    k.(string),
			Total: rc.total,
			Done:  done,
		}
		return false // stop — one active check per session
	})

	if found == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, found)
}

// inlineUpdateGeo updates geo fields for working proxies of a single check
// in one transaction. Scoped to the check's rows so other checks are unaffected.
func inlineUpdateGeo(db *sql.DB, checkID string, results []geoworker.Result) {
	tx, err := db.Begin()
	if err != nil {
		log.Printf("[geoworker] inline update begin tx: %v", err)
		return
	}
	for _, gr := range results {
		if _, err := tx.Exec(
			`UPDATE check_results
			 SET country_code = ?, country_name = ?, country_flag = ?, city = ?, geo_status = 'done'
			 WHERE check_id = ? AND host = ? AND geo_status = 'pending'`,
			gr.CountryCode, gr.CountryName, gr.CountryFlag, gr.City, checkID, gr.Host,
		); err != nil {
			log.Printf("[geoworker] inline update row: %v", err)
			_ = tx.Rollback()
			return
		}
	}
	if err := tx.Commit(); err != nil {
		log.Printf("[geoworker] inline update commit: %v", err)
	}
}

// sendStoredResults streams all results for a finished check as SSE events,
// paginating the DB reads so that checks with arbitrarily many results are
// delivered without truncation or excessive memory use.
func (s *server) sendStoredResults(w http.ResponseWriter, r *http.Request, checkID string) {
	const pageSize = 1000
	sid := guestSessionIDFromCtx(r.Context())
	for page := 1; ; page++ {
		items, total, err := s.store.GetCheckResults(r.Context(), checkID, sid, page, pageSize)
		if err != nil {
			log.Printf("sse: get check results %s page %d: %v", checkID, page, err)
			writeSSEEvent(w, "error", map[string]string{"error": "failed to load results"})
			return
		}
		for _, item := range items {
			writeSSEEvent(w, "result", storeResultToAPI(item))
		}
		// Stop when we have fetched all rows or when an empty page is returned
		// (safety guard in case total is stale).
		if len(items) == 0 || page*pageSize >= total {
			break
		}
	}
	writeSSEEvent(w, "complete", map[string]string{"status": "complete"})
}

// writeSSEEvent serialises data as JSON and writes a named SSE event.
func writeSSEEvent(w http.ResponseWriter, event string, data interface{}) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

// =============================================================================
// Proxy check — stop / history
// =============================================================================

func (s *server) handleStopCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if v, ok := s.checks.Load(id); ok {
		rc := v.(*runningCheck)
		// In guest mode only the owning session may cancel a check.
		if s.mode == "guest" && rc.sessionID != guestSessionIDFromCtx(r.Context()) {
			jsonUnauthorized(w)
			return
		}
		atomic.StoreInt32(&rc.cancelled, 1)
		rc.cancel()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleListChecks(w http.ResponseWriter, r *http.Request) {
	checks, err := s.store.ListChecks(r.Context(), guestSessionIDFromCtx(r.Context()))
	if err != nil {
		log.Printf("list checks: %v", err)
		jsonError(w, http.StatusInternalServerError, "failed to list checks")
		return
	}
	if checks == nil {
		checks = []store.Check{}
	}
	writeJSON(w, checks)
}

func (s *server) handleGetCheckResults(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// In guest mode enforce that the check belongs to the requesting session
	// to prevent IDOR (reading another session's results by guessing a check UUID).
	if s.mode == "guest" {
		sid := guestSessionIDFromCtx(r.Context())
		belongs, err := s.store.CheckBelongsToSession(r.Context(), id, sid)
		if err != nil {
			log.Printf("get check results ownership %s: %v", id, err)
			jsonError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if !belongs {
			jsonUnauthorized(w)
			return
		}
	}

	page, limit := parsePagination(r)
	items, total, err := s.store.GetCheckResults(r.Context(), id, guestSessionIDFromCtx(r.Context()), page, limit)
	if err != nil {
		log.Printf("get check results %s: %v", id, err)
		jsonError(w, http.StatusInternalServerError, "failed to get results")
		return
	}
	apiItems := make([]apiResult, len(items))
	for i, item := range items {
		apiItems[i] = storeResultToAPI(item)
	}
	writeJSON(w, map[string]interface{}{"items": apiItems, "total": total})
}

func (s *server) handleDeleteCheck(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	deleted, err := s.store.DeleteCheck(r.Context(), id, guestSessionIDFromCtx(r.Context()))
	if err != nil {
		log.Printf("delete check %s: %v", id, err)
		jsonError(w, http.StatusInternalServerError, "failed to delete check")
		return
	}
	if !deleted {
		// 0 rows affected: check does not exist or (in guest mode) belongs to a
		// different session. Return 404 rather than 204 so the caller knows
		// nothing was removed.
		jsonError(w, http.StatusNotFound, "check not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleClearChecks(w http.ResponseWriter, r *http.Request) {
	if s.mode == "guest" {
		// In guest mode only clear the requesting session's checks.
		sid := guestSessionIDFromCtx(r.Context())
		if err := s.store.ClearSessionChecks(r.Context(), sid); err != nil {
			log.Printf("clear session checks: %v", err)
			jsonError(w, http.StatusInternalServerError, "failed to clear history")
			return
		}
	} else {
		if err := s.store.Reset(); err != nil {
			log.Printf("clear checks: %v", err)
			jsonError(w, http.StatusInternalServerError, "failed to clear history")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// =============================================================================
// Settings
// =============================================================================

func (s *server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.settings.Get())
}

func (s *server) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var cfg settings.Settings
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	// Preserve the stored version string. The frontend does not know or manage
	// the schema version — it is owned by the backend for migration purposes.
	cfg.Version = s.settings.Get().Version
	if err := s.settings.Update(cfg); err != nil {
		log.Printf("update settings: %v", err)
		jsonError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// =============================================================================
// Judges
// =============================================================================

func (s *server) handleJudgesRefresh(w http.ResponseWriter, r *http.Request) {
	cfg := s.settings.Get()

	judgeItems := make([]judges.JudgeItem, len(cfg.Judges.Items))
	for i, it := range cfg.Judges.Items {
		judgeItems[i] = judges.JudgeItem{URL: it.URL, Validate: it.Validate, Active: it.Active}
	}

	j, err := judges.New(r.Context(), judgeItems, []string{"http", "https", "socks4", "socks5"}, cfg.Judges.Swap)
	if err != nil {
		log.Printf("refresh judges: %v", err)
		writeJSON(w, []interface{}{})
		return
	}

	s.mu.Lock()
	s.judges = j
	s.mu.Unlock()

	writeJSON(w, j.Status())
}

// =============================================================================
// Blacklist
// =============================================================================

func (s *server) handleBlacklistStatus(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	bl := s.blists
	s.mu.RUnlock()

	if bl == nil {
		writeJSON(w, []interface{}{})
		return
	}
	writeJSON(w, bl.HitCounts())
}

func (s *server) handleBlacklistRefresh(w http.ResponseWriter, r *http.Request) {
	cfg := s.settings.Get()

	items := make([]blacklist.Item, len(cfg.Blacklist.Items))
	for i, it := range cfg.Blacklist.Items {
		items[i] = blacklist.Item{Title: it.Title, Path: it.Path}
	}

	bl, err := blacklist.New(r.Context(), items)
	if err != nil {
		log.Printf("refresh blacklist: %v", err)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	s.mu.Lock()
	s.blists = bl
	s.mu.Unlock()

	w.WriteHeader(http.StatusNoContent)
}

// =============================================================================
// IP / version
// =============================================================================

func (s *server) handleGetIP(w http.ResponseWriter, r *http.Request) {
	cfg := s.settings.Get()
	publicIP, err := ip.GetPublicIP(r.Context(), cfg.IP.LookupURL)
	if err != nil {
		log.Printf("get public IP: %v", err)
		writeJSON(w, map[string]string{"ip": ""})
		return
	}
	writeJSON(w, map[string]string{"ip": strings.TrimSpace(publicIP)})
}

func (s *server) handleGetVersion(w http.ResponseWriter, r *http.Request) {
	info := updater.Check(r.Context(), appVersion)
	writeJSON(w, info)
}

// handleGetMode returns the server run mode so the frontend can adapt its UI.
// This endpoint is intentionally unauthenticated — the mode is not sensitive.
// In guest mode a "limits" object is included so the frontend can enforce them
// proactively (e.g. disabling the Check button before a request is even made).
func (s *server) handleGetMode(w http.ResponseWriter, r *http.Request) {
	resp := map[string]interface{}{"mode": s.mode}
	if s.mode == "guest" && s.guestInFlightLimit > 0 {
		resp["limits"] = map[string]int{
			"inFlightProxies": s.guestInFlightLimit,
		}
	}
	writeJSON(w, resp)
}

// =============================================================================
// Trace status
// =============================================================================

// chmodBPFScriptPath is the path installed by the wireshark-chmodbpf Homebrew cask.
const chmodBPFScriptPath = "/Library/Application Support/Wireshark/ChmodBPF/ChmodBPF"

// handleTraceStatus reports whether packet capture is available on this machine.
// The frontend calls this when the user enables the "Capture Traces" toggle.
func (s *server) handleTraceStatus(w http.ResponseWriter, r *http.Request) {
	iface, openErr := probeCapture()
	log.Printf("[trace/status] probe iface=%q err=%v", iface, openErr)

	if openErr == nil {
		writeJSON(w, map[string]interface{}{"available": true})
		return
	}

	reason := classifyPcapErr(openErr)

	// On macOS, if BPF permission is denied, check whether ChmodBPF is already
	// installed. If it is, the user just needs to run the script (no reinstall
	// needed); otherwise they need to install wireshark-chmodbpf first.
	if reason == "bpf_permission" && runtime.GOOS == "darwin" {
		if _, statErr := os.Stat(chmodBPFScriptPath); statErr == nil {
			reason = "bpf_chmodbpf_installed"
		}
	}

	writeJSON(w, map[string]interface{}{
		"available": false,
		"reason":    reason,
		"platform":  runtime.GOOS,
	})
}

// probeCapture attempts to open a pcap handle on the best available interface,
// returning the interface name tried and any error. On macOS "any" is not a
// real interface, so we prefer lo0 then the first device reported by pcap.
func probeCapture() (string, error) {
	candidates := []string{"lo0", "lo", "any"}

	// Prepend real devices so we try a real interface first.
	if devs, err := pcap.FindAllDevs(); err == nil {
		names := make([]string, 0, len(devs)+len(candidates))
		for _, d := range devs {
			names = append(names, d.Name)
		}
		names = append(names, candidates...)
		candidates = names
	}

	seen := make(map[string]bool)
	var lastErr error
	for _, iface := range candidates {
		if seen[iface] {
			continue
		}
		seen[iface] = true
		h, err := pcap.OpenLive(iface, 96, false, pcap.BlockForever)
		if err == nil {
			h.Close()
			return iface, nil
		}
		lastErr = err
	}
	return "", lastErr
}

func classifyPcapErr(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	for _, sub := range []string{"permission denied", "EACCES", "Operation not permitted"} {
		if strings.Contains(msg, sub) {
			if runtime.GOOS == "linux" {
				return "cap_net_raw"
			}
			return "bpf_permission"
		}
	}
	for _, sub := range []string{"No such file", "wpcap", "npcap", "Npcap"} {
		if strings.Contains(msg, sub) {
			return "npcap_missing"
		}
	}
	if strings.Contains(msg, "libpcap") {
		return "libpcap_missing"
	}
	return "unavailable"
}
