package proxy

import (
	"context"
	"fmt"
	"io"
	"net"
	"time"
)

// SOCKS4DialFunc returns a DialContext-compatible function for a SOCKS4/SOCKS4a proxy.
//
// When localDNS is false (default), SOCKS4a is used: the target hostname is
// forwarded to the proxy for resolution. When localDNS is true the hostname is
// resolved locally to an IPv4 address first (classic SOCKS4 behaviour).
//
// d is the dialer used to connect to the proxy server. Pass nil to use a plain
// dialer with the given timeout. Callers that need port-level tracing should
// inject a dialer with a Control hook (see tracingDialer in the checker package).
func SOCKS4DialFunc(proxyAddr string, timeout time.Duration, localDNS bool, d *net.Dialer) func(context.Context, string, string) (net.Conn, error) {
	if d == nil {
		d = &net.Dialer{Timeout: timeout}
	}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialSOCKS4(ctx, proxyAddr, addr, timeout, localDNS, d)
	}
}

func dialSOCKS4(ctx context.Context, proxyAddr, targetAddr string, timeout time.Duration, localDNS bool, d *net.Dialer) (net.Conn, error) {
	conn, err := d.DialContext(ctx, "tcp", proxyAddr)
	if err != nil {
		return nil, fmt.Errorf("socks4: connect to proxy: %w", err)
	}

	host, portStr, err := net.SplitHostPort(targetAddr)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4: parse target: %w", err)
	}

	port, err := net.LookupPort("tcp", portStr)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4: parse port: %w", err)
	}

	if err := conn.SetDeadline(time.Now().Add(timeout)); err != nil {
		conn.Close()
		return nil, err
	}

	var req []byte
	if localDNS {
		// Classic SOCKS4: resolve locally, send IPv4 address.
		ip, err := lookupIPv4(ctx, host)
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("socks4: %w", err)
		}
		req = []byte{
			0x04, 0x01,
			byte(port >> 8), byte(port & 0xFF),
			ip[0], ip[1], ip[2], ip[3],
			0x00, // USERID (empty, null-terminated)
		}
	} else {
		// SOCKS4a: signal proxy-side resolution via DSTIP=0.0.0.1,
		// followed by a null-terminated hostname after the USERID field.
		req = []byte{
			0x04, 0x01,
			byte(port >> 8), byte(port & 0xFF),
			0x00, 0x00, 0x00, 0x01, // DSTIP = 0.0.0.1 (non-zero last byte = SOCKS4a)
			0x00,                   // USERID (empty, null-terminated)
		}
		req = append(req, []byte(host)...)
		req = append(req, 0x00) // hostname null-terminator
	}

	if _, err := conn.Write(req); err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4: write request: %w", err)
	}

	// Response is always 8 bytes: VN(1) + CD(1) + DSTPORT(2) + DSTIP(4).
	resp := make([]byte, 8)
	if _, err := io.ReadFull(conn, resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("socks4: read response: %w", err)
	}
	if resp[1] != 0x5A {
		conn.Close()
		return nil, fmt.Errorf("socks4: request rejected: code 0x%02X", resp[1])
	}

	conn.SetDeadline(time.Time{})
	return conn, nil
}
