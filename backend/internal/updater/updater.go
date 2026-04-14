package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// releasesURL is the public R2 endpoint that serves releases.json.
// Override with UPDATES_URL env var for local testing (e.g. a mock server).
const defaultReleasesURL = "https://updates.proxyscrape.com/releases.json"

// Release holds the fields we expose from a single changelog entry.
type Release struct {
	TagName     string `json:"tagName"`
	PublishedAt string `json:"publishedAt"`
	HtmlURL     string `json:"htmlUrl"`
	Body        string `json:"body"`
}

// VersionInfo holds version comparison results returned to the frontend.
type VersionInfo struct {
	Current        string    `json:"current"`
	Latest         string    `json:"latest"`
	HasUpdate      bool      `json:"hasUpdate"`
	CanaryReleases []Release `json:"canaryReleases"`
	Releases       []Release `json:"releases"`
}

// r2Release matches the JSON schema produced by scripts/build-releases-json.mjs.
type r2Release struct {
	Version string `json:"version"`
	Date    string `json:"date"`
	Channel string `json:"channel"`
	Notes   string `json:"notes"`
}

// Check fetches releases.json from R2, splits by channel, and compares the
// latest matching release against currentVersion.
// On network or parse error, returns VersionInfo with HasUpdate=false.
func Check(ctx context.Context, currentVersion string) VersionInfo {
	info := VersionInfo{
		Current:        currentVersion,
		Latest:         currentVersion,
		HasUpdate:      false,
		CanaryReleases: []Release{},
		Releases:       []Release{},
	}

	url := defaultReleasesURL
	if override := os.Getenv("UPDATES_URL"); override != "" {
		url = override
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return info
	}
	req.Header.Set("User-Agent", "ProxyScrape-Proxy-Checker")
	// Bypass any CDN cache so we always get the freshest release list.
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := client.Do(req)
	if err != nil {
		return info
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return info
	}

	var all []r2Release
	if err := json.NewDecoder(resp.Body).Decode(&all); err != nil {
		return info
	}

	// Split into canary and stable lists (releases.json is already sorted
	// latest-first by the build script, so the first entry in each slice is
	// the newest).
	for _, r := range all {
		rel := Release{
			TagName:     r.Version,
			PublishedAt: r.Date,
			HtmlURL:     "https://github.com/ProxyScrape/proxyscrape-proxy-checker/releases/tag/v" + r.Version,
			Body:        r.Notes,
		}
		if r.Channel == "canary" {
			info.CanaryReleases = append(info.CanaryReleases, rel)
		} else {
			info.Releases = append(info.Releases, rel)
		}
	}

	// Determine the relevant "latest" version based on whether the running
	// build is a canary or stable release.
	current := strings.TrimPrefix(currentVersion, "v")
	isCanaryBuild := strings.Contains(current, "-canary") ||
		strings.Contains(current, "-beta") ||
		strings.Contains(current, "-alpha")

	if isCanaryBuild && len(info.CanaryReleases) > 0 {
		latest := strings.TrimPrefix(info.CanaryReleases[0].TagName, "v")
		info.Latest = latest
		info.HasUpdate = isNewerVersion(latest, current)
	} else if !isCanaryBuild && len(info.Releases) > 0 {
		latest := strings.TrimPrefix(info.Releases[0].TagName, "v")
		info.Latest = latest
		info.HasUpdate = isNewerVersion(latest, current)
	}

	return info
}

// isNewerVersion returns true only when candidate is strictly greater than base.
// Both strings may carry a "v" prefix and a pre-release suffix (e.g. "-canary").
func isNewerVersion(candidate, base string) bool {
	parse := func(v string) [3]int {
		v = strings.TrimPrefix(v, "v")
		v = strings.SplitN(v, "-", 2)[0] // strip -canary / -beta / etc.
		parts := strings.Split(v, ".")
		var out [3]int
		for i := 0; i < 3 && i < len(parts); i++ {
			out[i], _ = strconv.Atoi(parts[i])
		}
		return out
	}
	c := parse(candidate)
	b := parse(base)
	for i := 0; i < 3; i++ {
		if c[i] > b[i] {
			return true
		}
		if c[i] < b[i] {
			return false
		}
	}
	return false
}

// String returns a human-readable description of the version check result.
func (v VersionInfo) String() string {
	if v.HasUpdate {
		return fmt.Sprintf("Update available: %s → %s", v.Current, v.Latest)
	}
	return fmt.Sprintf("Up to date: %s", v.Current)
}
