//go:build !webserver

package api

import (
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"

	"github.com/google/gopacket/pcap"
)

// chmodBPFScriptPath is the path installed by the wireshark-chmodbpf Homebrew cask.
const chmodBPFScriptPath = "/Library/Application Support/Wireshark/ChmodBPF/ChmodBPF"

func (s *server) handleTraceStatus(w http.ResponseWriter, r *http.Request) {
	iface, openErr := probeCapture()
	log.Printf("[trace/status] probe iface=%q err=%v", iface, openErr)

	if openErr == nil {
		writeJSON(w, map[string]interface{}{"available": true})
		return
	}

	reason := classifyPcapErr(openErr)

	// On macOS, if BPF permission is denied, check whether ChmodBPF is already
	// installed. If it is, the user just needs to run the script (no reinstall
	// needed); otherwise they need to install wireshark-chmodbpf first.
	if reason == "bpf_permission" && runtime.GOOS == "darwin" {
		if _, statErr := os.Stat(chmodBPFScriptPath); statErr == nil {
			reason = "bpf_chmodbpf_installed"
		}
	}

	writeJSON(w, map[string]interface{}{
		"available": false,
		"reason":    reason,
		"platform":  runtime.GOOS,
	})
}

// probeCapture attempts to open a pcap handle on the best available interface,
// returning the interface name tried and any error. On macOS "any" is not a
// real interface, so we prefer lo0 then the first device reported by pcap.
func probeCapture() (string, error) {
	candidates := []string{"lo0", "lo", "any"}

	// Prepend real devices so we try a real interface first.
	if devs, err := pcap.FindAllDevs(); err == nil {
		names := make([]string, 0, len(devs)+len(candidates))
		for _, d := range devs {
			names = append(names, d.Name)
		}
		names = append(names, candidates...)
		candidates = names
	}

	seen := make(map[string]bool)
	var lastErr error
	for _, iface := range candidates {
		if seen[iface] {
			continue
		}
		seen[iface] = true
		h, err := pcap.OpenLive(iface, 96, false, pcap.BlockForever)
		if err == nil {
			h.Close()
			return iface, nil
		}
		lastErr = err
	}
	return "", lastErr
}

func classifyPcapErr(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	for _, sub := range []string{"permission denied", "EACCES", "Operation not permitted"} {
		if strings.Contains(msg, sub) {
			if runtime.GOOS == "linux" {
				return "cap_net_raw"
			}
			return "bpf_permission"
		}
	}
	for _, sub := range []string{"No such file", "wpcap", "npcap", "Npcap"} {
		if strings.Contains(msg, sub) {
			return "npcap_missing"
		}
	}
	if strings.Contains(msg, "libpcap") {
		return "libpcap_missing"
	}
	return "unavailable"
}
