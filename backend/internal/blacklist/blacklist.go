package blacklist

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Item describes a single blacklist source.
type Item struct {
	Title string `json:"title"`
	Path  string `json:"path"`
}

// ItemStatus reports how many hits were recorded for a blacklist.
type ItemStatus struct {
	Title string `json:"title"`
	Count int    `json:"count"`
}

// Blacklist loads and queries IP blacklists.
type Blacklist struct {
	data []listData
	hits map[string]int
	mu   sync.Mutex
}

type listData struct {
	title     string
	addresses []string
}

var ipRe = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:/\d{1,2})?\b`)

// New fetches all blacklist sources concurrently and returns a ready Blacklist.
// Errors on individual sources are silently ignored.
func New(ctx context.Context, items []Item) (*Blacklist, error) {
	bl := &Blacklist{
		hits: make(map[string]int),
	}

	var wg sync.WaitGroup
	var mu sync.Mutex

	for _, item := range items {
		wg.Add(1)
		go func(it Item) {
			defer wg.Done()

			content, err := fetchContent(ctx, it.Path)
			if err != nil {
				return
			}

			addresses := extractIPs(content)

			mu.Lock()
			bl.data = append(bl.data, listData{
				title:     it.Title,
				addresses: addresses,
			})
			mu.Unlock()
		}(item)
	}

	wg.Wait()
	return bl, nil
}

// Check returns blacklist titles containing the IP, or nil if none.
func (b *Blacklist) Check(ip string) []string {
	var found []string

	b.mu.Lock()
	defer b.mu.Unlock()

	for _, list := range b.data {
		if containsIP(ip, list.addresses) {
			found = append(found, list.title)
			b.hits[list.title]++
		}
	}

	return found
}

// HitCounts returns per-list hit counts.
func (b *Blacklist) HitCounts() []ItemStatus {
	b.mu.Lock()
	defer b.mu.Unlock()

	result := make([]ItemStatus, 0, len(b.hits))
	for title, count := range b.hits {
		result = append(result, ItemStatus{Title: title, Count: count})
	}
	return result
}

func fetchContent(ctx context.Context, path string) (string, error) {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
		if err != nil {
			return "", err
		}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}
		return string(body), nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func extractIPs(content string) []string {
	matches := ipRe.FindAllString(content, -1)
	if matches == nil {
		return nil
	}

	seen := make(map[string]struct{}, len(matches))
	result := make([]string, 0, len(matches))
	for _, m := range matches {
		if _, ok := seen[m]; !ok {
			seen[m] = struct{}{}
			result = append(result, m)
		}
	}
	return result
}

func containsIP(ip string, addresses []string) bool {
	for _, addr := range addresses {
		if strings.Contains(addr, "/") {
			_, cidr, err := net.ParseCIDR(addr)
			if err != nil {
				continue
			}
			parsed := net.ParseIP(ip)
			if parsed != nil && cidr.Contains(parsed) {
				return true
			}
		} else {
			if ip == addr {
				return true
			}
		}
	}
	return false
}
