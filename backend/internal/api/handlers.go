package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	mrand "math/rand"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/gopacket/pcap"
	"github.com/google/uuid"
	"github.com/proxyscrape/checker-backend/internal/blacklist"
	"github.com/proxyscrape/checker-backend/internal/checker"
	"github.com/proxyscrape/checker-backend/internal/ip"
	"github.com/proxyscrape/checker-backend/internal/judges"
	"github.com/proxyscrape/checker-backend/internal/settings"
	"github.com/proxyscrape/checker-backend/internal/store"
	"github.com/proxyscrape/checker-backend/internal/updater"
	"golang.org/x/crypto/bcrypt"
)

// runningCheck holds live state for an in-progress proxy check.
type runningCheck struct {
	cancel    context.CancelFunc
	results   chan checker.Result   // tee output; buffered = len(proxies); SSE reads from here
	progress  chan checker.Progress // passed to checker.Run; SSE reads from here
	done      chan struct{}         // closed after check goroutine fully finishes (store saved)
	cancelled int32                // atomic; 1 when user requested cancellation via DELETE /check/{id}, 0 on natural finish
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
		j, err = judges.New(judgeCtx, judgeItems, req.Protocols, false)
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

	rc := &runningCheck{
		cancel:   cancel,
		results:  make(chan checker.Result, len(proxies)),
		progress: make(chan checker.Progress, 100),
		done:     make(chan struct{}),
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

		startTime := time.Now()

		// rawCh is what checker.Run writes to; tee goroutine fans it out.
		rawCh := make(chan checker.Result, total)

		var collected []checker.Result
		teeDone := make(chan struct{})

		go func() {
			defer close(teeDone)
			defer close(rc.results)
			for result := range rawCh {
				collected = append(collected, result)
				// Non-blocking send: rc.results has capacity = total, so this
				// almost never drops, but we protect against a disconnected SSE.
				select {
				case rc.results <- result:
				default:
				}
			}
		}()

		_ = c.Run(ctx, rawCh, rc.progress)
		<-teeDone

		elapsed := time.Since(startTime).Milliseconds()

		working := 0
		storeResults := make([]store.CheckResult, len(collected))
		for i, res := range collected {
			if res.Status == "working" {
				working++
			}
			storeResults[i] = resultToStore(checkID, res)
		}

		bgCtx := context.Background()
		if saveErr := s.store.SaveCheck(bgCtx, store.Check{
			ID:         checkID,
			CreatedAt:  time.Now(),
			Total:      total,
			Working:    working,
			TimeoutMs:  timeout,
			DurationMs: elapsed,
			Protocols:  protocols,
		}); saveErr != nil {
			log.Printf("save check %s: %v", checkID, saveErr)
		}
		if saveErr := s.store.SaveCheckResults(bgCtx, storeResults); saveErr != nil {
			log.Printf("save check results %s: %v", checkID, saveErr)
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

// geoStatusFor returns "pending" when the country code is empty (MMDB was
// unavailable at check time) and "done" otherwise.
func geoStatusFor(code string) string {
	if code == "" {
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
		GeoStatus: geoStatusFor(r.Country.Code),
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
		GeoStatus:    geoStatusFor(r.Country.Code),
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
	// Validate token from header or query param (outside auth middleware).
	token := extractBearer(r)
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" || !s.verify(r.Context(), token) {
		jsonError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	// Stream live events if the check is still running.
	if v, ok := s.checks.Load(id); ok {
		rc := v.(*runningCheck)
		s.streamLiveEvents(w, r, rc)
		return
	}

	// Check is finished (or never existed); send stored results.
	s.sendStoredResults(w, r, id)
}

// streamLiveEvents consumes the results and progress channels of an active check
// and writes SSE events until completion or client disconnect.
func (s *server) streamLiveEvents(w http.ResponseWriter, r *http.Request, rc *runningCheck) {
	resultsCh := rc.results
	progressCh := rc.progress

	for {
		select {
		case result, ok := <-resultsCh:
			if !ok {
				// Results channel closed; wait for the goroutine to finish
				// persisting before signalling the client.
				select {
				case <-rc.done:
				case <-r.Context().Done():
				}
			// "complete" = all proxies were checked naturally.
			// "stopped"  = user cancelled the run mid-way via DELETE /check/{id}.
			if atomic.LoadInt32(&rc.cancelled) == 1 {
				writeSSEEvent(w, "stopped", map[string]string{"status": "stopped"})
			} else {
				writeSSEEvent(w, "complete", map[string]string{"status": "complete"})
			}
				return
			}
			writeSSEEvent(w, "result", resultToAPI(result))

		case prog, ok := <-progressCh:
			if !ok {
				// Set to nil so this case is never selected again.
				progressCh = nil
			} else {
				writeSSEEvent(w, "progress", prog)
			}

		case <-r.Context().Done():
			return
		}
	}
}

// sendStoredResults loads all results for a finished check from the store
// and sends them as SSE events, then sends a "complete" event.
func (s *server) sendStoredResults(w http.ResponseWriter, r *http.Request, checkID string) {
	items, _, err := s.store.GetCheckResults(r.Context(), checkID, 1, 100000)
	if err != nil {
		log.Printf("sse: get check results %s: %v", checkID, err)
		writeSSEEvent(w, "error", map[string]string{"error": "failed to load results"})
		return
	}
	for _, item := range items {
		writeSSEEvent(w, "result", storeResultToAPI(item))
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
		atomic.StoreInt32(&rc.cancelled, 1)
		rc.cancel()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleListChecks(w http.ResponseWriter, r *http.Request) {
	checks, err := s.store.ListChecks(r.Context())
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
	page, limit := parsePagination(r)
	items, total, err := s.store.GetCheckResults(r.Context(), id, page, limit)
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
	if err := s.store.DeleteCheck(r.Context(), id); err != nil {
		log.Printf("delete check %s: %v", id, err)
		jsonError(w, http.StatusInternalServerError, "failed to delete check")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleClearChecks(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Reset(); err != nil {
		log.Printf("clear checks: %v", err)
		jsonError(w, http.StatusInternalServerError, "failed to clear history")
		return
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

// =============================================================================
// MMDB
// =============================================================================

// handleMMDBReload hot-reloads the GeoIP database from disk.
// Called by the Electron main process after it finishes downloading a fresh copy.
func (s *server) handleMMDBReload(w http.ResponseWriter, r *http.Request) {
	if err := s.geoDB.Reload(); err != nil {
		jsonError(w, http.StatusServiceUnavailable, err.Error())
		return
	}
	writeJSON(w, map[string]interface{}{"status": "ok"})
}

// handleMMDBDecompress decompresses a zstd-compressed MMDB file downloaded by
// Electron. Electron downloads geoip.mmdb.zst to a temp path, then calls this
// endpoint. Go decompresses it to the final geoip.mmdb path and hot-reloads.
//
// Request body (JSON): { "src": "/tmp/geoip.mmdb.zst" }
// The destination path is always dataDir/mmdb/geoip.mmdb (known to the server).
func (s *server) handleMMDBDecompress(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Src string `json:"src"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Src == "" {
		jsonError(w, http.StatusBadRequest, "missing src path")
		return
	}

	if err := s.geoDB.DecompressAndReload(req.Src); err != nil {
		log.Printf("mmdb decompress: %v", err)
		jsonError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, map[string]interface{}{"status": "ok"})
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
