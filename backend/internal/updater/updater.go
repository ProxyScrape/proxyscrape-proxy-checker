package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/ProxyScrape/proxyscrape-proxy-checker/releases"

// Release holds the fields we expose from a GitHub pre-release.
type Release struct {
	TagName     string `json:"tagName"`
	PublishedAt string `json:"publishedAt"`
	HtmlURL     string `json:"htmlUrl"`
}

// VersionInfo holds version comparison results returned to the frontend.
type VersionInfo struct {
	Current        string    `json:"current"`
	Latest         string    `json:"latest"`
	HasUpdate      bool      `json:"hasUpdate"`
	CanaryReleases []Release `json:"canaryReleases"`
}

type githubRelease struct {
	TagName     string `json:"tag_name"`
	Prerelease  bool   `json:"prerelease"`
	PublishedAt string `json:"published_at"`
	HtmlURL     string `json:"html_url"`
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

	// Collect only pre-releases for the canary channel.
	for _, r := range all {
		if r.Prerelease {
			info.CanaryReleases = append(info.CanaryReleases, Release{
				TagName:     r.TagName,
				PublishedAt: r.PublishedAt,
				HtmlURL:     r.HtmlURL,
			})
		}
	}

	if len(info.CanaryReleases) == 0 {
		return info
	}

	latest := strings.TrimPrefix(info.CanaryReleases[0].TagName, "v")
	current := strings.TrimPrefix(currentVersion, "v")

	info.Latest = latest
	info.HasUpdate = latest != "" && latest != current

	return info
}

// String returns a human-readable description of the version check result.
func (v VersionInfo) String() string {
	if v.HasUpdate {
		return fmt.Sprintf("Canary update available: %s → %s", v.Current, v.Latest)
	}
	return fmt.Sprintf("Up to date: %s", v.Current)
}
