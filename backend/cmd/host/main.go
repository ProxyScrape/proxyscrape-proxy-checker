// Command proxychecker-host is the Chrome Native Messaging host for ProxyScrape Proxy Checker.
// Chrome launches it as a subprocess on every extension ping — it must start instantly,
// respond, and exit. No UI, no heavy init, no network calls.
//
// Protocol: 4-byte little-endian uint32 length prefix, followed by UTF-8 JSON body.
// Responds to {"action":"ping"} with {"status":"ok","version":"...","appRunning":bool}.
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

type pingRequest struct {
	Action string `json:"action"`
}

type pingResponse struct {
	Status     string `json:"status"`
	Version    string `json:"version"`
	AppRunning bool   `json:"appRunning"`
}

func main() {
	msg, err := readMessage(os.Stdin)
	if err != nil {
		os.Exit(1)
	}

	var req pingRequest
	if err := json.Unmarshal(msg, &req); err != nil || req.Action != "ping" {
		os.Exit(1)
	}

	resp := pingResponse{
		Status:     "ok",
		Version:    appVersion,
		AppRunning: isAppRunning(),
	}
	data, _ := json.Marshal(resp)
	_ = writeMessage(os.Stdout, data)
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
