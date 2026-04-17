---
description: Tracks Go vendor files that must be maintained manually because they are not present in upstream module releases
alwaysApply: true
---

# Manually Maintained Go Vendor Files

Some files in `backend/vendor/` are not part of any upstream module release and must be kept manually. **Running `go mod vendor` will silently delete them.** After any `go mod vendor` or `go mod tidy` + vendor run, check that these files still exist.

## `backend/vendor/github.com/google/gopacket/pcap/defs_windows_arm64.go`

**Why it exists:** `gopacket` v1.1.19 (the version we pin) does not include a `defs_windows_arm64.go` file. Without it, building for `GOOS=windows GOARCH=arm64` fails with a cascade of `undefined: pcapError*` / `undefined: pcapTPtr` errors because `pcap.go` references constants and types that are only defined in the platform-specific `defs_windows_*.go` stub.

**What it contains:** Pure Go constants and struct definitions derived from libpcap headers (same values as `defs_windows_amd64.go` — both targets are 64-bit so sizes are identical). No CGO.

**If it gets deleted:** Copy `defs_windows_amd64.go` to `defs_windows_arm64.go`:

```bash
cp backend/vendor/github.com/google/gopacket/pcap/defs_windows_amd64.go \
   backend/vendor/github.com/google/gopacket/pcap/defs_windows_arm64.go
```

Then commit it back before pushing.

## Windows Go builds use CGO_ENABLED=0

`pcap_windows.go` loads `wpcap.dll` at runtime via `syscall` — it contains no CGO. Only `pcap_unix.go` (Linux/macOS) uses `import "C"`. Windows builds therefore set `CGO_ENABLED=0` and require no C toolchain (no Zig, no MinGW). If someone re-enables `CGO_ENABLED=1` for Windows, it will break cross-compilation from Linux with no benefit.
