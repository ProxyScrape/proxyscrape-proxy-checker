package judges

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// JudgeItem describes a single judge endpoint.
type JudgeItem struct {
	URL      string `json:"url"`
	Validate string `json:"validate"`
	Active   bool   `json:"active"`
}

// JudgeStatus reports the ping result for a judge.
type JudgeStatus struct {
	URL       string `json:"url"`
	Alive     bool   `json:"alive"`
	IsSSL     bool   `json:"isSSL"`
	TimeoutMs int64  `json:"timeoutMs"`
}

type judgeEntry struct {
	url      string
	validate string
	compiled *regexp.Regexp // pre-compiled validate regex; nil means accept all
}

// Judges manages judge server availability for proxy checking.
type Judges struct {
	anyList  []judgeEntry
	anyIdx   atomic.Int64
	swap     bool
	statuses []JudgeStatus
	mu       sync.Mutex
}

// New pings all active judges concurrently (5 at a time) and returns a ready Judges.
// Returns error if required judge types are missing for targetProtocols.
func New(ctx context.Context, items []JudgeItem, targetProtocols []string, swap bool) (*Judges, error) {
	j := &Judges{swap: swap}

	active := make([]JudgeItem, 0, len(items))
	for _, it := range items {
		if it.Active {
			active = append(active, it)
		}
	}

	// Ping in chunks of 5
	for i := 0; i < len(active); i += 5 {
		end := i + 5
		if end > len(active) {
			end = len(active)
		}
		chunk := active[i:end]

		var wg sync.WaitGroup
		for _, item := range chunk {
			wg.Add(1)
			go func(it JudgeItem) {
				defer wg.Done()
				j.ping(ctx, it)
			}(item)
		}
		wg.Wait()
	}

	if len(targetProtocols) > 0 && len(j.anyList) == 0 {
		return nil, fmt.Errorf("no working judges")
	}

	return j, nil
}

func (j *Judges) ping(ctx context.Context, item JudgeItem) {
	isSSL := strings.HasPrefix(item.URL, "https://")
	status := JudgeStatus{
		URL:   item.URL,
		IsSSL: isSSL,
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			DisableKeepAlives:  true,
			DisableCompression: true,
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, item.URL, nil)
	if err != nil {
		j.mu.Lock()
		j.statuses = append(j.statuses, status)
		j.mu.Unlock()
		return
	}

	start := time.Now()
	resp, err := client.Do(req)
	elapsed := time.Since(start).Milliseconds()
	if err != nil {
		log.Printf("[judges] FAIL %s: %v", item.URL, err)
		j.mu.Lock()
		j.statuses = append(j.statuses, status)
		j.mu.Unlock()
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	log.Printf("[judges] OK   %s (%dms, status=%d)", item.URL, elapsed, resp.StatusCode)
	status.Alive = true
	status.TimeoutMs = elapsed

	entry := judgeEntry{url: item.URL, validate: item.Validate}
	if item.Validate != "" {
		if re, err := regexp.Compile(item.Validate); err == nil {
			entry.compiled = re
		}
	}

	j.mu.Lock()
	j.anyList = append(j.anyList, entry)
	j.statuses = append(j.statuses, status)
	j.mu.Unlock()
}

// GetAny returns any judge URL (round-robin if swap=true).
func (j *Judges) GetAny() string {
	if len(j.anyList) == 0 {
		return ""
	}
	if !j.swap || len(j.anyList) == 1 {
		return j.anyList[0].url
	}
	idx := j.anyIdx.Add(1) - 1
	return j.anyList[idx%int64(len(j.anyList))].url
}

// Validate checks whether a response body passes the judge's validation regex.
func (j *Judges) Validate(body, judgeURL string) bool {
	j.mu.Lock()
	var compiled *regexp.Regexp
	for _, e := range j.anyList {
		if e.url == judgeURL {
			compiled = e.compiled
			break
		}
	}
	j.mu.Unlock()

	if compiled == nil {
		return true
	}
	return compiled.MatchString(body)
}

// Status returns the ping status of all judges.
func (j *Judges) Status() []JudgeStatus {
	j.mu.Lock()
	defer j.mu.Unlock()
	result := make([]JudgeStatus, len(j.statuses))
	copy(result, j.statuses)
	return result
}
