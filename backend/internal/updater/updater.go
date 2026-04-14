package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/ProxyScrape/proxyscrape-proxy-checker/releases"

// Release holds the fields we expose from a GitHub release.
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

type githubRelease struct {
	TagName     string `json:"tag_name"`
	PublishedAt string `json:"published_at"`
	HtmlURL     string `json:"html_url"`
	Body        string `json:"body"`
}

// Check fetches GitHub releases, considers only pre-releases for the canary channel,
// and compares the latest pre-release tag against currentVersion.
// On network error, returns VersionInfo with HasUpdate=false.
func Check(ctx context.Context, currentVersion string) VersionInfo {
	info := VersionInfo{
		Current:        currentVersion,
		Latest:         currentVersion,
		HasUpdate:      false,
		CanaryReleases: []Release{},
		Releases:       []Release{},
	}

	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubReleasesURL, nil)
	if err != nil {
		return info
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "ProxyScrape-Proxy-Checker")

	resp, err := client.Do(req)
	if err != nil {
		return info
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return info
	}

	var all []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&all); err != nil {
		return info
	}

	// Separate canary from stable by tag name pattern rather than GitHub's
	// prerelease flag. GitHub Releases are now created as regular releases
	// (not prereleases) for all channels, so the flag is no longer reliable.
	for _, r := range all {
		rel := Release{
			TagName:     r.TagName,
			PublishedAt: r.PublishedAt,
			HtmlURL:     r.HtmlURL,
			Body:        r.Body,
		}
		if strings.Contains(r.TagName, "-canary") ||
			strings.Contains(r.TagName, "-alpha") ||
			strings.Contains(r.TagName, "-beta") {
			info.CanaryReleases = append(info.CanaryReleases, rel)
		} else {
			info.Releases = append(info.Releases, rel)
		}
	}

	if len(info.CanaryReleases) == 0 {
		return info
	}

	latest := strings.TrimPrefix(info.CanaryReleases[0].TagName, "v")
	current := strings.TrimPrefix(currentVersion, "v")

	info.Latest = latest
	info.HasUpdate = isNewerVersion(latest, current)

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
		return fmt.Sprintf("Canary update available: %s → %s", v.Current, v.Latest)
	}
	return fmt.Sprintf("Up to date: %s", v.Current)
}
