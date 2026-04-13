//go:build windows

package checker

import (
	"net"
	"syscall"
)

// listenConfigWithReuseAddr returns a net.ListenConfig that explicitly sets
// SO_REUSEADDR on the listener socket before bind(). On Windows, Go does NOT
// set SO_REUSEADDR on listeners by default, and the OS can hold recently-freed
// ephemeral ports for several seconds. Setting SO_REUSEADDR here makes the
// reserved port available to the dialer's bind() call even during that window.
func listenConfigWithReuseAddr() net.ListenConfig {
	return net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			return c.Control(func(fd uintptr) {
				syscall.SetsockoptInt(syscall.Handle(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			})
		},
	}
}
