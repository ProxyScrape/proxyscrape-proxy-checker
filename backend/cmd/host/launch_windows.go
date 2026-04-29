//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// launchApp finds and starts the main app executable in the install directory.
// The host lives at <installDir>\resources\bin\<name>.exe, so the install root
// is three directories up. The main app .exe sits directly in that root.
func launchApp() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	installDir := filepath.Dir(filepath.Dir(filepath.Dir(exe)))
	entries, err := os.ReadDir(installDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".exe") {
			_ = exec.Command(filepath.Join(installDir, e.Name())).Start()
			return
		}
	}
}
