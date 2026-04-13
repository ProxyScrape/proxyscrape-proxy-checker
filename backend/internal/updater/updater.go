package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/ProxyScrape/proxy-checker/releases"

// VersionInfo holds version comparison results.
type VersionInfo struct {
	Current   string `json:"current"`
	Latest    string `json:"latest"`
	HasUpdate bool   `json:"hasUpdate"`
}

type githubRelease struct {
	TagName string `json:"tag_name"`
}

// Check fetches the latest release from GitHub and compares it with currentVersion.
// On network error, returns VersionInfo with HasUpdate=false.
func Check(ctx context.Context, currentVersion string) VersionInfo {
	info := VersionInfo{
		Current:   currentVersion,
		Latest:    currentVersion,
		HasUpdate: false,
	}

	client := &http.Client{Timeout: 10 * time.Second}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubReleasesURL, nil)
	if err != nil {
		return info
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return info
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return info
	}

	var releases []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return info
	}

	if len(releases) == 0 {
		return info
	}

	latest := strings.TrimPrefix(releases[0].TagName, "v")
	current := strings.TrimPrefix(currentVersion, "v")

	info.Latest = latest
	info.HasUpdate = latest != "" && latest != current

	return info
}

// String returns a human-readable description of the version check result.
func (v VersionInfo) String() string {
	if v.HasUpdate {
		return fmt.Sprintf("Update available: %s → %s", v.Current, v.Latest)
	}
	return fmt.Sprintf("Up to date: %s", v.Current)
}
