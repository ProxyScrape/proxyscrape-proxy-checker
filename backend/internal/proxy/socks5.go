// Copyright 2011 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package proxy

import (
	"context"
	"net"
)

// SOCKS5 returns a Dialer that makes SOCKSv5 connections to the given
// address with an optional username and password. See RFC 1928 and RFC 1929.
//
// localDNS controls DNS resolution behaviour:
//   - false (default): hostnames are forwarded to the proxy for resolution
//     (SOCKS5h semantics — no DNS leak from the checker machine).
//   - true: hostnames are resolved locally before connecting
//     (classic SOCKS5 semantics — not recommended for proxy checking).
func SOCKS5(network, address string, auth *Auth, forward Dialer, localDNS bool) (Dialer, error) {
	d := newSOCKSDialer(network, address) // returns *socksDialer
	d.LocalDNS = localDNS
	if forward != nil {
		if f, ok := forward.(ContextDialer); ok {
			d.ProxyDial = func(ctx context.Context, network string, address string) (net.Conn, error) {
				return f.DialContext(ctx, network, address)
			}
		} else {
			d.ProxyDial = func(ctx context.Context, network string, address string) (net.Conn, error) {
				return dialContext(ctx, forward, network, address)
			}
		}
	}
	if auth != nil {
		up := UsernamePassword{
			Username: auth.User,
			Password: auth.Password,
		}
		d.AuthMethods = []AuthMethod{
			AuthMethodNotRequired,
			AuthMethodUsernamePassword,
		}
		d.Authenticate = up.Authenticate
	}
	return d, nil
}
