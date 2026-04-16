// Package geoworker calls the ip-geo Cloudflare Worker to look up geolocation
// data for a batch of IP addresses.  It maps ip-api.com field names to the
// proxy checker's internal names and derives countryFlag slugs from the
// existing geo.InfoForCode table so no flag data needs to be duplicated.
package geoworker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/proxyscrape/checker-backend/internal/geo"
)

// workerBatchSize is the maximum IPs sent to the worker in a single HTTP
// request (the worker itself fans these out to ip-api in 100-IP batches).
const workerBatchSize = 10_000

// Result is the normalised geo result for a single IP/host.
type Result struct {
	Host        string
	CountryCode string
	CountryName string
	CountryFlag string
	City        string
}

// Client is a thin HTTP client for the ip-geo worker.
type Client struct {
	url        string
	httpClient *http.Client
}

// New returns a Client that will POST to the given worker URL.
func New(url string) *Client {
	return &Client{
		url: url,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// workerRequest matches the worker's POST body schema.
type workerRequest struct {
	IPs    []string `json:"ips"`
	Fields string   `json:"fields"`
}

// workerItem matches a single element of the worker's "results" array.
// ip-api returns the full country name as "country", not "countryName".
type workerItem struct {
	Query       string `json:"query"`
	Status      string `json:"status"`
	CountryCode string `json:"countryCode"`
	Country     string `json:"country"` // full name from ip-api
	City        string `json:"city"`
}

type workerResponse struct {
	Results []workerItem `json:"results"`
}

// LookupBatch resolves geo data for all hosts in a single logical call.
// Internally it chunks hosts into workerBatchSize slices and issues one HTTP
// request per chunk, continuing past any failed chunk rather than aborting.
// Hosts from failed chunks are omitted from the returned results so callers
// can detect them (absent from the result set) and leave them as pending for
// a future retry. A non-nil error is returned if any chunk failed, but
// results always contain whatever was successfully retrieved.
func (c *Client) LookupBatch(ctx context.Context, hosts []string) ([]Result, error) {
	out := make([]Result, 0, len(hosts))
	var firstErr error
	for i := 0; i < len(hosts); i += workerBatchSize {
		end := i + workerBatchSize
		if end > len(hosts) {
			end = len(hosts)
		}
		batch, err := c.lookupChunk(ctx, hosts[i:end])
		if err != nil {
			log.Printf("[geoworker] chunk [%d:%d] failed: %v — hosts will be marked done with unknown country", i, end, err)
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		out = append(out, batch...)
	}
	return out, firstErr
}

func (c *Client) lookupChunk(ctx context.Context, hosts []string) ([]Result, error) {
	body, err := json.Marshal(workerRequest{
		IPs:    hosts,
		Fields: "status,countryCode,country,city,query",
	})
	if err != nil {
		return nil, fmt.Errorf("geoworker: marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("geoworker: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "proxyscrape-checker/1.0")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("geoworker: http: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("geoworker: read body: %w", err)
	}
	log.Printf("[geoworker] status=%d body=%s", resp.StatusCode, rawBody)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("geoworker: unexpected status %d", resp.StatusCode)
	}

	var wr workerResponse
	if err := json.Unmarshal(rawBody, &wr); err != nil {
		return nil, fmt.Errorf("geoworker: decode: %w", err)
	}

	results := make([]Result, 0, len(wr.Results))
	for _, item := range wr.Results {
		r := Result{Host: item.Query}
		if item.Status == "success" && item.CountryCode != "" {
			name, flag, ok := geo.InfoForCode(item.CountryCode)
			if !ok {
				// Unknown code — fall back to ip-api's full name, leave flag empty.
				name = item.Country
			}
			r.CountryCode = item.CountryCode
			r.CountryName = name
			r.CountryFlag = flag
			r.City = item.City
		}
		results = append(results, r)
	}
	return results, nil
}
