#!/usr/bin/env node
// Builds the native messaging host binary for the current platform/arch only.
// Fast (~1 s) because CGO_ENABLED=0 — no C toolchain needed.
// Invoked automatically via the predev npm lifecycle before `npm run dev`.
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.npm_package_version;

const platform = process.platform;
const arch = process.arch;

const targets = {
    'darwin/arm64': { GOOS: 'darwin',   GOARCH: 'arm64', out: 'proxychecker-host-darwin-arm64' },
    'darwin/x64':   { GOOS: 'darwin',   GOARCH: 'amd64', out: 'proxychecker-host-darwin-x64' },
    'linux/arm64':  { GOOS: 'linux',    GOARCH: 'arm64', out: 'proxychecker-host-linux-arm64' },
    'linux/x64':    { GOOS: 'linux',    GOARCH: 'amd64', out: 'proxychecker-host-linux-x64' },
    'win32/arm64':  { GOOS: 'windows',  GOARCH: 'arm64', out: 'proxychecker-host-win-arm64.exe' },
    'win32/x64':    { GOOS: 'windows',  GOARCH: 'amd64', out: 'proxychecker-host-win-x64.exe' },
};

const target = targets[`${platform}/${arch}`];
if (!target) {
    console.error(`Unsupported platform: ${platform}/${arch}`);
    process.exit(1);
}

process.stdout.write(`Building native messaging host (${target.GOOS}/${target.GOARCH})... `);

const result = spawnSync('go', [
    'build', '-C', 'backend',
    `-ldflags=-X 'main.appVersion=${version}'`,
    `-o=${join(root, 'bin', target.out)}`,
    './cmd/host',
], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, GOOS: target.GOOS, GOARCH: target.GOARCH, CGO_ENABLED: '0' },
});

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`done (bin/${target.out})`);
