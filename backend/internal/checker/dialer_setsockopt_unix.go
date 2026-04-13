//go:build !windows

package checker

import (
	"net"
	"syscall"
)

// listenConfigWithReuseAddr returns a net.ListenConfig that explicitly sets
// SO_REUSEADDR on the listener socket before bind(). On Unix, Go already does
// this by default, so this is a no-op belt-and-suspenders guard.
func listenConfigWithReuseAddr() net.ListenConfig {
	return net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			return c.Control(func(fd uintptr) {
				syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			})
		},
	}
}
