package checker

import (
	"context"
	"net"
	"time"
)

const (
	// maxPortReservationAttempts is how many times we try to reserve a fresh
	// ephemeral port before giving up and falling back to a plain dialer.
	maxPortReservationAttempts = 5
)

// reserveEphemeralPort briefly binds a TCP listener on :0, lets the OS assign
// a free ephemeral port, records it, and immediately closes the listener.
// SO_REUSEADDR is set on the listener so the port is released promptly and the
// subsequent dialer bind can reuse it even if the OS briefly holds the port
// (particularly relevant on Windows).
//
// Up to maxPortReservationAttempts tries are made in case a reserved port is
// stolen by another process in the tiny window between Close() and Dial().
// Returns 0, false only if all attempts fail (extremely unlikely).
func reserveEphemeralPort() (uint16, bool) {
	lc := listenConfigWithReuseAddr()
	for range maxPortReservationAttempts {
		ln, err := lc.Listen(context.Background(), "tcp", ":0")
		if err != nil {
			continue
		}
		port := uint16(ln.Addr().(*net.TCPAddr).Port)
		ln.Close()
		if port != 0 {
			return port, true
		}
	}
	return 0, false
}

// tracingDialer returns a net.Dialer pre-bound to a freshly reserved ephemeral
// port and appends that port to localPorts before any dial attempt. Because the
// port is recorded upfront, pcap packet attribution works even when connect()
// subsequently fails (RST, timeout, refused) — the SYN was sent from the known
// port and filterPacketsByPorts can match it.
//
// If all port reservation attempts fail, a plain dialer is returned and
// localPorts is left unchanged; callers should fall back to reading
// conn.LocalAddr() post-connect for the success case.
func tracingDialer(timeout time.Duration, localPorts *[]uint16) *net.Dialer {
	if localPorts == nil {
		return &net.Dialer{Timeout: timeout}
	}
	port, ok := reserveEphemeralPort()
	if !ok {
		return &net.Dialer{Timeout: timeout}
	}
	*localPorts = append(*localPorts, port)
	return &net.Dialer{
		Timeout:   timeout,
		LocalAddr: &net.TCPAddr{Port: int(port)},
	}
}
