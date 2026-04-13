package checker

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket/pcap"
	"github.com/proxyscrape/checker-backend/internal/blacklist"
	"github.com/proxyscrape/checker-backend/internal/geo"
	"github.com/proxyscrape/checker-backend/internal/judges"
	"github.com/proxyscrape/checker-backend/internal/proxy"
)

// TraceEvent is a single timing or packet event recorded during a proxy check.
type TraceEvent struct {
	Kind     string `json:"kind"`
	OffsetMs int64  `json:"offsetMs"`
	Bytes    int    `json:"bytes,omitempty"`
	Detail   string `json:"detail,omitempty"`
}

// traceCollector accumulates application-level events from httptrace hooks and
// SOCKS dialer instrumentation. All events are relative to a shared start time
// so they can be merged with packet-level events from pcap.
type traceCollector struct {
	start  time.Time
	mu     sync.Mutex
	events []TraceEvent
}

func newTraceCollector(start time.Time) *traceCollector {
	return &traceCollector{start: start}
}

func (tc *traceCollector) record(kind, detail string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	tc.events = append(tc.events, TraceEvent{
		Kind:     kind,
		OffsetMs: time.Since(tc.start).Milliseconds(),
		Detail:   detail,
	})
}

func (tc *traceCollector) snapshot() []TraceEvent {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	out := make([]TraceEvent, len(tc.events))
	copy(out, tc.events)
	return out
}

// finalizeAppTrace appends tc's current snapshot to accTrace (when non-nil)
// and returns the combined slice. On single-attempt traces where accTrace is
// nil, tc's events are returned directly — identical to previous behaviour.
func finalizeAppTrace(tc *traceCollector, accTrace *[]TraceEvent) []TraceEvent {
	if tc == nil {
		return nil
	}
	snap := tc.snapshot()
	if accTrace == nil || len(*accTrace) == 0 {
		return snap
	}
	*accTrace = append(*accTrace, snap...)
	return *accTrace
}

// mergeAndSort merges two event slices and returns them sorted by OffsetMs.
func mergeAndSort(a, b []TraceEvent) []TraceEvent {
	merged := make([]TraceEvent, 0, len(a)+len(b))
	merged = append(merged, a...)
	merged = append(merged, b...)
	sort.Slice(merged, func(i, j int) bool {
		return merged[i].OffsetMs < merged[j].OffsetMs
	})
	return merged
}

// Proxy represents a single proxy to check.
type Proxy struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Auth     string `json:"auth"`     // "user:pass" or "none"
	Protocol string `json:"protocol"` // declared protocol from import or "" to use global list
}

// Options controls checker behaviour.
type Options struct {
	Timeout         int  // milliseconds
	Threads         int
	Retries         int
	KeepAlive       bool
	CaptureServer   bool
	CaptureFullData bool
	CaptureTrace    bool // enable packet-level + application-level tracing
	// LocalDNS forces client-side DNS resolution for SOCKS4 and SOCKS5 proxies.
	// When false (default), hostnames are forwarded to the proxy for resolution
	// (SOCKS4a / SOCKS5h semantics). Not recommended for general proxy checking.
	LocalDNS bool
}

// ProtoFullData holds the raw judge response for a single protocol.
type ProtoFullData struct {
	Body    string            `json:"body,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// Result is the outcome of checking a single proxy.
type Result struct {
	Proxy      Proxy                    `json:"proxy"`
	Status     string                   `json:"status"` // "working", "failed", "cancelled"
	Protocols  []string                 `json:"protocols"`
	Anon       string                   `json:"anon"`
	TimeoutMs  int64                    `json:"timeoutMs"`
	Country    geo.Country              `json:"country"`
	City       string                   `json:"city"`
	Blacklists []string                 `json:"blacklists"`
	Errors     map[string]string        `json:"errors"`
	Server     string                   `json:"server,omitempty"`
	KeepAlive  bool                     `json:"keepAlive,omitempty"`
	Traces     map[string][]TraceEvent  `json:"traces,omitempty"`
	FullData   map[string]ProtoFullData `json:"fullData,omitempty"`
}

// Progress reports checking progress.
type Progress struct {
	Done    int `json:"done"`
	Total   int `json:"total"`
	Working int `json:"working"`
	Threads int `json:"threads"`
}

// Checker is the core proxy checking engine.
type Checker struct {
	proxies      []Proxy
	options      Options
	myIP         string
	judges       *judges.Judges
	protocols    []string
	blacklist    *blacklist.Blacklist
	stopped      chan struct{}
	mu           sync.Mutex
	workingCount int
	doneCount    int
}

// New creates a new Checker instance.
func New(proxies []Proxy, options Options, myIP string, j *judges.Judges, protocols []string, bl *blacklist.Blacklist) *Checker {
	return &Checker{
		proxies:   proxies,
		options:   options,
		myIP:      myIP,
		judges:    j,
		protocols: protocols,
		blacklist: bl,
		stopped:   make(chan struct{}),
	}
}

// Stop signals the checker to stop processing.
func (c *Checker) Stop() {
	select {
	case <-c.stopped:
	default:
		close(c.stopped)
	}
}

// Run starts checking proxies concurrently using options.Threads workers.
// Sends Result events to results channel and throttled Progress events to progress channel.
// Blocks until all proxies are done or ctx is cancelled.
func (c *Checker) Run(ctx context.Context, results chan<- Result, progress chan<- Progress) error {
	defer close(results)
	defer close(progress)

	total := len(c.proxies)
	if total == 0 {
		return nil
	}

	threads := c.options.Threads
	if threads <= 0 {
		threads = 1
	}
	if threads > total {
		threads = total
	}

	work := make(chan Proxy, total)
	for _, p := range c.proxies {
		work <- p
	}
	close(work)

	// Progress ticker
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	var resultsMu sync.Mutex
	var wg sync.WaitGroup

	sendProgress := func() {
		c.mu.Lock()
		p := Progress{
			Done:    c.doneCount,
			Total:   total,
			Working: c.workingCount,
			Threads: threads,
		}
		c.mu.Unlock()
		select {
		case progress <- p:
		default:
		}
	}

	// Progress goroutine
	progressDone := make(chan struct{})
	go func() {
		defer close(progressDone)
		for {
			select {
			case <-ticker.C:
				sendProgress()
			case <-ctx.Done():
				return
			case <-c.stopped:
				return
			case <-progressDone:
				return
			}
		}
	}()

	for i := 0; i < threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for p := range work {
				select {
				case <-ctx.Done():
					return
				case <-c.stopped:
					return
				default:
				}

				result := c.checkProxy(ctx, p)
				if result.Status == "failed" && ctx.Err() != nil {
					result.Status = "cancelled"
					result.Errors = nil
				}

				resultsMu.Lock()
				results <- result
				c.mu.Lock()
				c.doneCount++
				if result.Status == "working" {
					c.workingCount++
				}
				c.mu.Unlock()
				resultsMu.Unlock()
			}
		}()
	}

	wg.Wait()

	// Stop the progress goroutine
	select {
	case <-progressDone:
	default:
	}

	// Send final progress
	sendProgress()

	return nil
}

func (c *Checker) checkProxy(ctx context.Context, p Proxy) Result {
	timeout := time.Duration(c.options.Timeout) * time.Millisecond

	// Use the protocol declared in the proxy's import line when present;
	// otherwise fall back to the global protocol list.
	protocols := c.protocols
	if p.Protocol != "" {
		protocols = []string{p.Protocol}
	}

	// --- Packet capture setup (opened before any dialing, no race) ---
	//
	// We pre-resolve the proxy hostname once and pin it for both the BPF filter
	// and the dialer. This eliminates the DNS-mismatch case where the dialer
	// independently resolves to a different IP than the pcap filter was set to.
	var (
		captureStart    time.Time
		captureHandles  []*pcap.Handle
		packetsDone     = make(chan []capturedPacket, 1)
	)

	// dialProxy is the proxy descriptor used for actual dialing. When tracing,
	// we substitute the resolved IP so pcap filter and dialer agree on the IP.
	dialProxy := p

	if c.options.CaptureTrace {
		// Round(0) strips the monotonic clock reading, leaving only the wall
		// clock. pcap packet timestamps are also wall-clock (CLOCK_REALTIME),
		// so both sides subtract from the same clock base and stay aligned even
		// if the monotonic and wall clocks diverge during a long capture.
		captureStart = time.Now().Round(0)
		resolvedIP := resolveFirstIP(ctx, p.Host)
		if resolvedIP != "" {
			// Pin the dialer to the same IP the BPF filter will watch.
			dialProxy.Host = resolvedIP
			if handles, err := openCaptureHandles(resolvedIP, p.Port); err == nil {
				captureHandles = handles
				go func() {
					packetsDone <- drainAllHandles(captureHandles, captureStart, uint16(p.Port))
				}()
			}
		}
		if captureHandles == nil {
			close(packetsDone)
		}
	}

	// --- Protocol checks (concurrent) ---
	protoResults := make([]protoResult, len(protocols))
	// localPortsSlices[i] accumulates every ephemeral port used by protocol i
	// across all connection attempts (including retries). Used to attribute raw
	// pcap packets to the correct protocol when multiple protocols share one IP.
	localPortsSlices := make([][]uint16, len(protocols))
	var wg sync.WaitGroup

	for i, protocol := range protocols {
		wg.Add(1)
		go func(idx int, proto string) {
			defer wg.Done()
			var ports []uint16
			var portsPtr *[]uint16
			var accTrace []TraceEvent
			var accTracePtr *[]TraceEvent
			if c.options.CaptureTrace {
				portsPtr = &ports
				accTracePtr = &accTrace
			}
			protoResults[idx] = c.checkProtocol(ctx, dialProxy, proto, timeout, 0, captureStart, portsPtr, accTracePtr)
			if portsPtr != nil {
				localPortsSlices[idx] = ports
			}
		}(i, protocol)
	}
	wg.Wait()

	// Close all pcap handles; the drainAllHandles goroutine will finish.
	closeAllHandles(captureHandles)

	// --- Build result ---
	result := Result{
		Proxy:     p,
		Protocols: []string{},
		Anon:      "",
	}

	var proxyIP string
	var anyAlive bool

	for _, pr := range protoResults {
		if !pr.alive {
			continue
		}

		anyAlive = true
		result.Protocols = append(result.Protocols, pr.protocol)

		if pr.elapsed > result.TimeoutMs {
			result.TimeoutMs = pr.elapsed
		}

		if proxyIP == "" {
			proxyIP = extractIP(pr.body)
		}

		if pr.protocol == "http" {
			result.Anon = c.getAnon(pr.body)
			if c.options.CaptureServer && result.Server == "" {
				result.Server = getServer(pr.headers, pr.body)
			}
		} else if c.options.CaptureServer && result.Server == "" {
			result.Server = getServer(pr.headers, pr.body)
		}

		if c.options.KeepAlive {
			if pr.headers != nil {
				conn := pr.headers.Get("Connection")
				ka := pr.headers.Get("Keep-Alive")
				if strings.EqualFold(conn, "keep-alive") || ka != "" {
					result.KeepAlive = true
				}
			}
		}

		if c.options.CaptureFullData {
			fd := ProtoFullData{Body: pr.body}
			if pr.headers != nil {
				fd.Headers = make(map[string]string, len(pr.headers))
				for k, vs := range pr.headers {
					if len(vs) > 0 {
						fd.Headers[k] = vs[0]
					}
				}
			}
			if result.FullData == nil {
				result.FullData = make(map[string]ProtoFullData)
			}
			result.FullData[pr.protocol] = fd
		}
	}

	// Collect per-protocol errors
	result.Errors = make(map[string]string)
	for _, pr := range protoResults {
		if !pr.alive && pr.err != "" {
			result.Errors[pr.protocol] = pr.err
		}
	}

	if anyAlive {
		result.Status = "working"
	} else {
		result.Status = "failed"
	}

	if proxyIP != "" {
		country, city := geo.Lookup(proxyIP)
		result.Country = country
		result.City = city
	}

	if c.blacklist != nil {
		result.Blacklists = c.blacklist.Check(p.Host)
	}

	// --- Merge traces ---
	if c.options.CaptureTrace {
		var rawPackets []capturedPacket
		if captureHandles != nil {
			rawPackets = <-packetsDone
		}

		traces := make(map[string][]TraceEvent)

		// Per-protocol: filter raw packets by the ephemeral ports used by that
		// protocol's connections, then merge with application-level events.
		// This prevents packet events from one protocol leaking into another's
		// trace when multiple protocols are checked against the same proxy IP.
		for i, pr := range protoResults {
			filtered := filterPacketsByPorts(rawPackets, localPortsSlices[i])
			if pr.appTrace != nil {
				traces[pr.protocol] = mergeAndSort(filtered, pr.appTrace)
			} else if len(filtered) > 0 {
				traces[pr.protocol] = filtered
			}
		}

		if len(traces) > 0 {
			result.Traces = traces
		}
	}

	return result
}

type protoResult struct {
	protocol string
	alive    bool
	err      string // short failure reason; empty when alive
	body     string
	elapsed  int64
	headers  http.Header
	appTrace []TraceEvent // application-level events (httptrace + SOCKS hooks)
}

func (c *Checker) checkProtocol(ctx context.Context, p Proxy, protocol string, timeout time.Duration, retries int, captureStart time.Time, localPorts *[]uint16, accTrace *[]TraceEvent) protoResult {
	pr := protoResult{protocol: protocol}

	var tc *traceCollector
	if c.options.CaptureTrace {
		if captureStart.IsZero() {
			captureStart = time.Now()
		}
		tc = newTraceCollector(captureStart)

		// Inject a retry boundary marker so the trace clearly shows where a
		// new connection attempt begins. Only emitted for attempts 2, 3, …
		if retries > 0 && accTrace != nil {
			*accTrace = append(*accTrace, TraceEvent{
				Kind:     "attempt_start",
				OffsetMs: time.Since(captureStart).Milliseconds(),
				Detail:   fmt.Sprintf("attempt %d", retries+1),
			})
		}
	}

	var judgeURL string
	switch protocol {
	case "http", "https":
		judgeURL = c.judges.GetUsual()
	default:
		judgeURL = c.judges.GetAny()
	}

	if judgeURL == "" {
		pr.err = "no judge"
		return pr
	}

	client, err := c.buildClient(p, protocol, timeout, tc, localPorts)
	if err != nil {
		pr.err = "build failed"
		return pr
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, judgeURL, nil)
	if err != nil {
		pr.err = "build failed"
		return pr
	}

	if c.options.KeepAlive {
		req.Header.Set("Connection", "keep-alive")
	}

	// Attach httptrace hooks for transport-level events only.
	// dial_start / tcp_connected / tcp_failed are recorded exclusively inside
	// each buildClient wrapper (buildHTTPClient, buildSOCKS4Client,
	// buildSOCKS5Client). Keeping ConnectStart/ConnectDone out of here
	// eliminates any risk of a second firing from net.Dialer's internal hook
	// machinery when it reads the request context's nettrace.
	if tc != nil {
		ht := &httptrace.ClientTrace{
			TLSHandshakeStart: func() {
				tc.record("tls_start", "")
			},
			TLSHandshakeDone: func(_ tls.ConnectionState, err error) {
				if err != nil {
					tc.record("tls_failed", err.Error())
				} else {
					tc.record("tls_done", "")
				}
			},
			WroteRequest: func(info httptrace.WroteRequestInfo) {
				if info.Err != nil {
					tc.record("request_failed", info.Err.Error())
				} else {
					tc.record("request_sent", "")
				}
			},
			GotFirstResponseByte: func() {
				tc.record("response_start", "")
			},
		}
		req = req.WithContext(httptrace.WithClientTrace(req.Context(), ht))
	}

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()

	if err != nil {
		if tc != nil {
			tc.record("done", classifyErr(err))
		}
		// Retry on network errors — pass the same localPorts and accTrace
		// pointers so ports and events accumulate across all attempts.
		if retries < c.options.Retries {
			if tc != nil && accTrace != nil {
				*accTrace = append(*accTrace, tc.snapshot()...)
			}
			return c.checkProtocol(ctx, p, protocol, timeout, retries+1, captureStart, localPorts, accTrace)
		}
		if tc != nil {
			pr.appTrace = finalizeAppTrace(tc, accTrace)
		}
		if strings.Contains(err.Error(), "timeout") || errors.Is(err, context.DeadlineExceeded) {
			pr.err = "timeout"
		} else if strings.Contains(err.Error(), "refused") {
			pr.err = "refused"
		} else {
			pr.err = "connection failed"
		}
		return pr
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		if tc != nil {
			tc.record("done", "read failed")
			pr.appTrace = finalizeAppTrace(tc, accTrace)
		}
		pr.err = "read failed"
		return pr
	}

	bodyStr := string(body)

	if !c.judges.Validate(bodyStr, judgeURL) {
		if tc != nil {
			tc.record("done", "invalid response")
			pr.appTrace = finalizeAppTrace(tc, accTrace)
		}
		pr.err = "invalid response"
		return pr
	}

	if tc != nil {
		tc.record("done", "ok")
		pr.appTrace = finalizeAppTrace(tc, accTrace)
	}

	pr.alive = true
	pr.body = bodyStr
	pr.elapsed = elapsed
	pr.headers = resp.Header

	return pr
}

func (c *Checker) buildClient(p Proxy, protocol string, timeout time.Duration, tc *traceCollector, localPorts *[]uint16) (*http.Client, error) {
	switch protocol {
	case "http", "https":
		return c.buildHTTPClient(p, protocol, timeout, tc, localPorts), nil
	case "socks4":
		return c.buildSOCKS4Client(p, timeout, tc, localPorts)
	case "socks5":
		return c.buildSOCKS5Client(p, timeout, tc, localPorts)
	default:
		return nil, fmt.Errorf("unknown protocol: %s", protocol)
	}
}

func (c *Checker) buildHTTPClient(p Proxy, protocol string, timeout time.Duration, tc *traceCollector, localPorts *[]uint16) *http.Client {
	proxyAddr := fmt.Sprintf("%s:%d", p.Host, p.Port)
	proxyURL := &url.URL{
		Scheme: protocol,
		Host:   proxyAddr,
	}
	if p.Auth != "none" && p.Auth != "" {
		parts := strings.SplitN(p.Auth, ":", 2)
		if len(parts) == 2 {
			proxyURL.User = url.UserPassword(parts[0], parts[1])
		}
	}

	// tracingDialer reserves a port before dialing so the port is known even
	// when connect() fails. If reservation fails (<<0.01% chance), fall back
	// to capturing the port from conn.LocalAddr() on success.
	td := tracingDialer(timeout, localPorts)
	portReserved := localPorts != nil && td.LocalAddr != nil

	// dialContext wraps td.DialContext so that dial-level events (dial_start,
	// tcp_connected, tcp_failed) are recorded directly here rather than through
	// httptrace.ConnectStart/ConnectDone hooks. This is the same pattern used
	// by the SOCKS wrappers: one authoritative recording path per event, no
	// chance of a second firing from the net.Dialer's internal hook machinery.
	dialContext := func(ctx context.Context, network, addr string) (net.Conn, error) {
		if tc != nil {
			tc.record("dial_start", proxyAddr)
		}
		conn, err := td.DialContext(ctx, network, addr)
		if err != nil {
			if tc != nil {
				tc.record("tcp_failed", classifyErr(err))
			}
			return nil, err
		}
		if !portReserved && localPorts != nil {
			if ta, ok := conn.LocalAddr().(*net.TCPAddr); ok {
				*localPorts = append(*localPorts, uint16(ta.Port))
			}
		}
		if tc != nil {
			tc.record("tcp_connected", proxyAddr)
		}
		return conn, nil
	}

	transport := &http.Transport{
		Proxy:               http.ProxyURL(proxyURL),
		DialContext:         dialContext,
		TLSHandshakeTimeout: timeout,
		DisableKeepAlives:   true,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}
}

func (c *Checker) buildSOCKS4Client(p Proxy, timeout time.Duration, tc *traceCollector, localPorts *[]uint16) (*http.Client, error) {
	proxyAddr := fmt.Sprintf("%s:%d", p.Host, p.Port)

	// tracingDialer reserves a port upfront so attribution works even for
	// failed connections. Falls back to nil (plain dialer) if reservation fails;
	// in that case the post-connect LocalAddr() read below is the fallback.
	td := tracingDialer(timeout, localPorts)
	portReserved := localPorts != nil && td.LocalAddr != nil
	dialFn := proxy.SOCKS4DialFunc(proxyAddr, timeout, c.options.LocalDNS, td)

	var wrappedDial func(context.Context, string, string) (net.Conn, error)
	if tc != nil {
		wrappedDial = func(ctx context.Context, network, addr string) (net.Conn, error) {
			tc.record("dial_start", proxyAddr)
			conn, err := dialFn(ctx, network, addr)
			if err != nil {
				errStr := err.Error()
				switch {
				case strings.Contains(errStr, "connect to proxy"):
					tc.record("tcp_failed", classifyErr(err))
				case strings.Contains(errStr, "rejected"):
					tc.record("tunnel_rejected", errStr)
				default:
					tc.record("tunnel_failed", classifyErr(err))
				}
				return nil, err
			}
			if !portReserved && localPorts != nil {
				if ta, ok := conn.LocalAddr().(*net.TCPAddr); ok {
					*localPorts = append(*localPorts, uint16(ta.Port))
				}
			}
			tc.record("tunnel_established", proxyAddr)
			return conn, nil
		}
	} else {
		wrappedDial = dialFn
	}

	transport := &http.Transport{
		DialContext:         wrappedDial,
		TLSHandshakeTimeout: timeout,
		DisableKeepAlives:   true,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}, nil
}

func (c *Checker) buildSOCKS5Client(p Proxy, timeout time.Duration, tc *traceCollector, localPorts *[]uint16) (*http.Client, error) {
	proxyAddr := fmt.Sprintf("%s:%d", p.Host, p.Port)

	var auth *proxy.Auth
	if p.Auth != "none" && p.Auth != "" {
		parts := strings.SplitN(p.Auth, ":", 2)
		if len(parts) == 2 {
			auth = &proxy.Auth{User: parts[0], Password: parts[1]}
		}
	}

	// tracingDialer reserves a port upfront so attribution works even for
	// failed connections. Falls back to a plain dialer if reservation fails.
	td := tracingDialer(timeout, localPorts)
	portReserved := localPorts != nil && td.LocalAddr != nil

	dialer, err := proxy.SOCKS5("tcp", proxyAddr, auth, td, c.options.LocalDNS)
	if err != nil {
		return nil, err
	}

	cd := dialer.(proxy.ContextDialer)

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			if tc != nil {
				tc.record("dial_start", proxyAddr)
			}
			conn, err := cd.DialContext(ctx, network, addr)
			if err != nil {
				if tc != nil {
					tc.record("tunnel_failed", classifyErr(err))
				}
				return nil, err
			}
			if !portReserved && localPorts != nil {
				if ta, ok := conn.LocalAddr().(*net.TCPAddr); ok {
					*localPorts = append(*localPorts, uint16(ta.Port))
				}
			}
			if tc != nil {
				tc.record("tunnel_established", proxyAddr)
			}
			return conn, nil
		},
		TLSHandshakeTimeout: timeout,
		DisableKeepAlives:   true,
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
	}, nil
}

// resolveFirstIP resolves the first IPv4 (or any) address for host.
// Returns empty string on failure.
func resolveFirstIP(ctx context.Context, host string) string {
	if ip := net.ParseIP(host); ip != nil {
		return host
	}
	addrs, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil || len(addrs) == 0 {
		return ""
	}
	// Prefer IPv4.
	for _, a := range addrs {
		if net.ParseIP(a).To4() != nil {
			return a
		}
	}
	return addrs[0]
}

// classifyErr maps a raw network error to a short user-readable reason.
func classifyErr(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	switch {
	case strings.Contains(s, "refused"):
		return "connection refused"
	case strings.Contains(s, "timeout") || errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case strings.Contains(s, "no route"):
		return "no route to host"
	case strings.Contains(s, "network is unreachable"):
		return "network unreachable"
	default:
		return "connection failed"
	}
}

var remoteAddrRe = regexp.MustCompile(`(?i)\bREMOTE_ADDR\s*=\s*(\S+)`)
var ipv4Re = regexp.MustCompile(`^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`)
var anonHeaderRe = regexp.MustCompile(`(?i)HTTP_VIA|PROXY_REMOTE_ADDR`)

func extractIP(body string) string {
	trimmed := strings.TrimSpace(body)

	if ipv4Re.MatchString(trimmed) {
		return trimmed
	}

	if m := remoteAddrRe.FindStringSubmatch(trimmed); len(m) > 1 {
		if ipv4Re.MatchString(m[1]) {
			return m[1]
		}
	}

	return ""
}

func (c *Checker) getAnon(body string) string {
	if c.myIP != "" && strings.Contains(body, c.myIP) {
		return "transparent"
	}

	if anonHeaderRe.MatchString(body) {
		return "anonymous"
	}

	return "elite"
}

func getServer(headers http.Header, body string) string {
	// Prefer the actual Server response header when present.
	if headers != nil {
		if sv := strings.TrimSpace(headers.Get("Server")); sv != "" {
			return sv
		}
	}
	// Fall back to keyword scan of the response body (legacy proxies that
	// inject server info into the body instead of headers).
	lower := strings.ToLower(body)
	for _, name := range []string{"squid", "mikrotik", "tinyproxy", "litespeed", "varnish", "haproxy"} {
		if strings.Contains(lower, name) {
			return name
		}
	}
	return ""
}
