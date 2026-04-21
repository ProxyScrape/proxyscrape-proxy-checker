//go:build webserver

package checker

import "time"

// captureHandleSet is a nil-comparable placeholder for the webserver build,
// which is compiled without CGO and therefore cannot link against libpcap.
// Using a slice (rather than a struct) preserves the == nil comparisons in
// checker.go without any changes to that file.
// Desktop builds use []*pcap.Handle via capture.go instead.
type captureHandleSet []struct{}

// capturedPacket mirrors the type defined in capture.go for the desktop build.
// srcPort/dstPort are intentionally omitted here: checker.go never reads those
// fields directly (only capture.go does), and drainAllHandles always returns nil
// in webserver mode so the struct is never populated.
type capturedPacket struct {
	TraceEvent
}

// openCaptureHandles always returns an error in webserver mode because packet
// capture requires libpcap, which is not available in this build.
func openCaptureHandles(_ string, _ int) (captureHandleSet, error) {
	return nil, nil
}

// closeAllHandles is a no-op in webserver mode.
func closeAllHandles(_ captureHandleSet) {}

// drainAllHandles always returns nil in webserver mode — no packets are ever
// captured so there is nothing to drain.
func drainAllHandles(_ captureHandleSet, _ time.Time, _ uint16) []capturedPacket {
	return nil
}

// filterPacketsByPorts always returns nil in webserver mode.
func filterPacketsByPorts(_ []capturedPacket, _ []uint16) []TraceEvent {
	return nil
}
