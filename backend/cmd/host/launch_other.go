//go:build !darwin && !windows

package main

// launchApp is a no-op on Linux: the AppImage mount path is not stable enough
// to derive the original .AppImage file from inside the mount. The caller falls
// back to exit(1) so the extension uses the URI path instead.
func launchApp() {}
