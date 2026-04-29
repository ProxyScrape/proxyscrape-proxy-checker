// Command proxychecker-host is the Chrome Native Messaging host for ProxyScrape Proxy Checker.
// Chrome launches it as a subprocess on every extension message — it must start instantly,
// respond, and exit. No UI, no heavy init, no network calls.
//
// Protocol: 4-byte little-endian uint32 length prefix, followed by UTF-8 JSON body.
//
// Supported actions:
//   ping  → {"status":"ok","version":"...","appRunning":bool,"appInstalled":bool}
//   check → writes proxies to a temp file for the Electron app to pick up; returns {"ok":true}
package main

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// appVersion is injected at build time: -ldflags "-X main.appVersion=2.4.2-canary"
var appVersion = "dev"

type request struct {
	Action  string   `json:"action"`
	Proxies []string `json:"proxies"`
	Source  string   `json:"source"`
}

type pingResponse struct {
	Status       string `json:"status"`
	Version      string `json:"version"`
	AppRunning   bool   `json:"appRunning"`
	AppInstalled bool   `json:"appInstalled"`
}

type checkPayload struct {
	Proxies []string `json:"proxies"`
	Source  string   `json:"source"`
}

func main() {
	msg, err := readMessage(os.Stdin)
	if err != nil {
		os.Exit(1)
	}

	var req request
	if err := json.Unmarshal(msg, &req); err != nil {
		os.Exit(1)
	}

	switch req.Action {
	case "ping":
		resp := pingResponse{
			Status:       "ok",
			Version:      appVersion,
			AppRunning:   isAppRunning(),
			AppInstalled: isPackagedInstall(),
		}
		data, _ := json.Marshal(resp)
		_ = writeMessage(os.Stdout, data)

	case "check":
		if !isAppRunning() {
			if !isPackagedInstall() {
				// Dev mode: content.js will have already shown the download toast,
				// but exit non-zero as a safety net for any unexpected code path.
				os.Exit(1)
			}
			// Packaged install, app not running: launch it directly (no browser
			// dialog) and fall through to write the temp file so the app picks
			// up the proxy list as soon as it finishes starting.
			launchApp()
		}
		payload := checkPayload{Proxies: req.Proxies, Source: req.Source}
		data, _ := json.Marshal(payload)
		checkFile := filepath.Join(os.TempDir(), "proxychecker-check.json")
		_ = os.WriteFile(checkFile, data, 0600)
		ok, _ := json.Marshal(map[string]bool{"ok": true})
		_ = writeMessage(os.Stdout, ok)

	default:
		os.Exit(1)
	}
}

func readMessage(r io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	// 1 MB sanity cap — a ping message is never more than a few bytes.
	if length > 1<<20 {
		return nil, io.ErrUnexpectedEOF
	}
	buf := make([]byte, length)
	_, err := io.ReadFull(r, buf)
	return buf, err
}

func writeMessage(w io.Writer, data []byte) error {
	if err := binary.Write(w, binary.LittleEndian, uint32(len(data))); err != nil {
		return err
	}
	_, err := w.Write(data)
	return err
}

// isPackagedInstall reports whether this binary is running from a packaged
// (installed) build rather than a development checkout. Packaged binaries live
// at .../resources/bin/<name> on all platforms; dev binaries live directly
// inside the repository's bin/ directory whose parent is never "resources".
func isPackagedInstall() bool {
	exe, err := os.Executable()
	if err != nil {
		return false
	}
	// Dir(exe) = .../resources/bin  →  Dir(Dir(exe)) = .../resources
	parent := strings.ToLower(filepath.Base(filepath.Dir(filepath.Dir(exe))))
	return parent == "resources"
}

// isAppRunning checks whether the main Proxy Checker Electron process is alive.
// The Electron main process writes os.TempDir()/proxychecker.pid on startup
// and removes it on exit. We read that PID and test liveness without sending
// a real signal (signal 0 on unix, GetExitCodeProcess on windows).
func isAppRunning() bool {
	pidFile := filepath.Join(os.TempDir(), "proxychecker.pid")
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return false
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil || pid <= 0 {
		return false
	}
	return isProcessAlive(pid)
}
