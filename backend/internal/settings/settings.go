package settings

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
)

// CoreSettings holds the primary proxy-checking configuration.
//
// ⚠️  PERSISTENCE CONTRACT: this struct MUST stay in sync with PERSISTED_CORE_FIELDS in
//
//	src/renderer/store/reducers/core.js
//
// When adding a new field to that list, add the matching JSON-tagged field here too,
// or the value will be sent by the frontend but silently dropped on load.
type CoreSettings struct {
	Timeout         int             `json:"timeout"`
	Threads         int             `json:"threads"`
	Retries         int             `json:"retries"`
	Shuffle         bool            `json:"shuffle"`
	KeepAlive       bool            `json:"keepAlive"`
	CaptureServer   bool            `json:"captureServer"`
	CaptureFullData bool            `json:"captureFullData"`
	CaptureTrace    bool            `json:"captureTrace"`
	// OverrideProtocols forces the checker to test all protocols regardless of input list.
	OverrideProtocols bool            `json:"overrideProtocols"`
	Protocols         map[string]bool `json:"protocols"`
	// LocalDNS forces client-side DNS resolution for SOCKS4/SOCKS5 proxies.
	// Off by default; not recommended for general proxy checking.
	LocalDNS bool `json:"localDns"`
}

// JudgeItem is a single HTTP judge endpoint.
type JudgeItem struct {
	URL      string `json:"url"`
	Validate string `json:"validate"`
	Active   bool   `json:"active"`
}

// JudgesSettings configures judge rotation.
type JudgesSettings struct {
	Items []JudgeItem `json:"items"`
	Swap  bool        `json:"swap"`
}

// IPSettings configures external-IP lookup.
type IPSettings struct {
	Current   string `json:"current"`
	LookupURL string `json:"lookupUrl"`
}

// BlacklistItem is a single blacklist source file.
type BlacklistItem struct {
	Title  string `json:"title"`
	Path   string `json:"path"`
	Active bool   `json:"active"`
}

// BlacklistSettings controls blacklist filtering.
type BlacklistSettings struct {
	Filter bool            `json:"filter"`
	Items  []BlacklistItem `json:"items"`
}

// ExportingSettings controls proxy list export format.
type ExportingSettings struct {
	Type     int `json:"type"`
	AuthType int `json:"authType"`
}

// Settings is the full application settings document.
type Settings struct {
	Core      CoreSettings      `json:"core"`
	Judges    JudgesSettings    `json:"judges"`
	IP        IPSettings        `json:"ip"`
	Blacklist BlacklistSettings `json:"blacklist"`
	Exporting ExportingSettings `json:"exporting"`
	Version   string            `json:"version"`
}

const ipRegex = `REMOTE_ADDR = (25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)`

// DefaultSettings matches the JS SettingsConstants defaults exactly.
var DefaultSettings = Settings{
	Core: CoreSettings{
		Timeout:   15000,
		Threads:   350,
		Retries:   0,
		Shuffle:   false,
		KeepAlive: false,
		Protocols: map[string]bool{
			"http":   true,
			"https":  true,
			"socks4": true,
			"socks5": true,
		},
	},
	Judges: JudgesSettings{
		Swap: true,
		Items: []JudgeItem{
			{URL: "http://judge1.api.proxyscrape.com", Validate: "AZ Environment variables", Active: true},
			{URL: "http://judge2.api.proxyscrape.com", Validate: "AZ Environment variables", Active: true},
			{URL: "http://judge3.api.proxyscrape.com", Validate: "AZ Environment variables", Active: true},
			{URL: "http://judge4.api.proxyscrape.com", Validate: "AZ Environment variables", Active: true},
			{URL: "http://judge5.api.proxyscrape.com", Validate: "AZ Environment variables", Active: true},
			{URL: "https://ssl-judge1.api.proxyscrape.com", Validate: ipRegex, Active: false},
			{URL: "https://ssl-judge2.api.proxyscrape.com", Validate: ipRegex, Active: false},
		},
	},
	IP: IPSettings{
		LookupURL: "https://api.proxyscrape.com/ip.php",
	},
	Blacklist: BlacklistSettings{
		Filter: false,
		Items: []BlacklistItem{
			{Title: "Spamhaus DROP", Path: "https://www.spamhaus.org/drop/drop.txt", Active: true},
			{Title: "Spamhaus EDROP", Path: "https://www.spamhaus.org/drop/edrop.txt", Active: true},
			{Title: "MYIP.MS General", Path: "https://myip.ms/files/blacklist/general/latest_blacklist.txt", Active: true},
		},
	},
	Exporting: ExportingSettings{
		Type:     1,
		AuthType: 1,
	},
	Version: "2.0.0",
}

// Manager provides thread-safe access to the settings file.
type Manager struct {
	mu   sync.RWMutex
	path string
	data Settings
}

// Load reads settings from <dataDir>/settings.json, applying defaults and migrations.
// If the file does not exist the defaults are used and written to disk.
func Load(dataDir string) (*Manager, error) {
	path := filepath.Join(dataDir, "settings.json")
	m := &Manager{path: path}

	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		m.data = copyDefaults()
		if err := m.writeFile(); err != nil {
			return nil, fmt.Errorf("settings: write defaults: %w", err)
		}
		return m, nil
	}
	if err != nil {
		return nil, fmt.Errorf("settings: read file: %w", err)
	}

	migrated, err := migrate(raw)
	if err != nil {
		return nil, fmt.Errorf("settings: migrate: %w", err)
	}

	var s Settings
	if err := json.Unmarshal(migrated, &s); err != nil {
		return nil, fmt.Errorf("settings: parse: %w", err)
	}
	applyDefaults(&s)
	m.data = s
	return m, nil
}

// Get returns a snapshot of the current settings (mutex-protected).
func (m *Manager) Get() Settings {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.data
}

// Update persists new settings atomically (write to .tmp, then rename).
func (m *Manager) Update(s Settings) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.data = s
	return m.writeFile()
}

// writeFile serialises m.data and writes it atomically; caller must hold m.mu (write).
func (m *Manager) writeFile() error {
	b, err := json.MarshalIndent(m.data, "", "  ")
	if err != nil {
		return fmt.Errorf("settings: marshal: %w", err)
	}

	tmp := m.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return fmt.Errorf("settings: write tmp: %w", err)
	}
	if err := os.Rename(tmp, m.path); err != nil {
		return fmt.Errorf("settings: rename: %w", err)
	}
	return nil
}

// migrate applies version-based migrations to raw JSON bytes.
// Currently: version < 1.5.3 renames core.retry → core.retries = 0.
// Also sanitises any string-typed numeric fields produced by the v1.x React
// frontend (where form inputs always yield strings) so json.Unmarshal into
// typed Go structs does not fail.
func migrate(raw []byte) ([]byte, error) {
	var doc map[string]interface{}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, err
	}

	version, _ := doc["version"].(string)
	if versionLessThan(version, "1.5.3") {
		if core, ok := doc["core"].(map[string]interface{}); ok {
			if _, hasRetry := core["retry"]; hasRetry {
				delete(core, "retry")
				core["retries"] = 0
			}
		}
	}

	// Sanitise string-typed numeric fields. The v1.x React app stored settings
	// via HTML form inputs which always produce strings, so a migrated
	// settings.json may contain e.g. "threads":"350" instead of "threads":350.
	// json.Unmarshal is strict and refuses to put a string into an int field,
	// so we normalise here before the final unmarshal.
	sanitiseIntFields(doc, "core", "timeout", "threads", "retries")
	sanitiseIntFields(doc, "exporting", "type", "authType")

	return json.Marshal(doc)
}

// sanitiseIntFields converts any string values for the named fields inside
// section to their numeric equivalents. Other value types are left untouched.
func sanitiseIntFields(doc map[string]interface{}, section string, fields ...string) {
	sec, ok := doc[section].(map[string]interface{})
	if !ok {
		return
	}
	for _, field := range fields {
		v, exists := sec[field]
		if !exists {
			continue
		}
		if s, ok := v.(string); ok {
			if n, err := strconv.ParseFloat(s, 64); err == nil {
				sec[field] = n
			}
		}
	}
}

// versionLessThan compares two simple "major.minor.patch" version strings.
// Returns true if a < b.
func versionLessThan(a, b string) bool {
	if a == "" {
		return true
	}
	var aMaj, aMin, aPatch int
	var bMaj, bMin, bPatch int
	fmt.Sscanf(a, "%d.%d.%d", &aMaj, &aMin, &aPatch)
	fmt.Sscanf(b, "%d.%d.%d", &bMaj, &bMin, &bPatch)

	if aMaj != bMaj {
		return aMaj < bMaj
	}
	if aMin != bMin {
		return aMin < bMin
	}
	return aPatch < bPatch
}

// copyDefaults returns a deep copy of DefaultSettings.
func copyDefaults() Settings {
	s := DefaultSettings
	s.Core.Protocols = make(map[string]bool, len(DefaultSettings.Core.Protocols))
	for k, v := range DefaultSettings.Core.Protocols {
		s.Core.Protocols[k] = v
	}
	s.Judges.Items = make([]JudgeItem, len(DefaultSettings.Judges.Items))
	copy(s.Judges.Items, DefaultSettings.Judges.Items)
	s.Blacklist.Items = make([]BlacklistItem, len(DefaultSettings.Blacklist.Items))
	copy(s.Blacklist.Items, DefaultSettings.Blacklist.Items)
	return s
}

// applyDefaults fills in zero-value fields from DefaultSettings.
func applyDefaults(s *Settings) {
	if s.Core.Protocols == nil {
		s.Core.Protocols = make(map[string]bool, len(DefaultSettings.Core.Protocols))
		for k, v := range DefaultSettings.Core.Protocols {
			s.Core.Protocols[k] = v
		}
	}
	if s.Judges.Items == nil {
		s.Judges.Items = make([]JudgeItem, len(DefaultSettings.Judges.Items))
		copy(s.Judges.Items, DefaultSettings.Judges.Items)
	}
	if s.Blacklist.Items == nil {
		s.Blacklist.Items = []BlacklistItem{}
	}
	if s.IP.LookupURL == "" {
		s.IP.LookupURL = DefaultSettings.IP.LookupURL
	}
	if s.Version == "" {
		s.Version = DefaultSettings.Version
	}
}
