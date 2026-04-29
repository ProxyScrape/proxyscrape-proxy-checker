//go:build darwin

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// launchApp opens the .app bundle that contains this binary.
// exe lives at <Bundle>.app/Contents/Resources/bin/<name>, so walking up
// four directories reaches the bundle root.
func launchApp() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	bundle := filepath.Dir(filepath.Dir(filepath.Dir(filepath.Dir(exe))))
	if !strings.HasSuffix(bundle, ".app") {
		return
	}
	_ = exec.Command("open", bundle).Start()
}
