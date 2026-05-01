// electron-builder configuration.
// appId and productName are derived automatically from the package.json version:
//   - version contains "-canary"  →  canary identifiers (separate install, separate userData)
//   - plain semver (e.g. "2.0.0") →  stable identifiers
// This means merging canary into master and bumping the version is all that is
// needed at graduation — no manual edits to this file required.
//
// IMPORTANT — stable appId continuity:
// v1.x releases shipped with no explicit appId, so electron-builder used its
// default: "com.electron.proxyscrape-proxy-checker". The stable v2 appId MUST
// match this so that:
//   - Windows NSIS recognises the existing v1 install and upgrades it cleanly
//   - macOS/Linux userData directories are the same path (settings + DB preserved)
// Do NOT change the stable appId without a cross-directory migration strategy.

const pkg = require('./package.json');
const isCanary = pkg.version.includes('-canary');

module.exports = {
  appId: isCanary ? 'com.proxyscrape.checker.canary' : 'com.electron.proxyscrape-proxy-checker',
  productName: isCanary ? 'ProxyScrape Proxy Checker Canary' : 'ProxyScrape Proxy Checker',
  copyright: 'ProxyScrape',
  // Strip all Chromium locale .pak files except English from every platform's
  // packaged app. Saves ~25 MB per installer with no user-visible effect — the
  // app UI is entirely custom React; the only Chromium-owned strings (native
  // context menus) still render in English.
  // Two values are required: 'en-US' matches en.lproj on macOS (prefix match)
  // and en-US.pak on Windows/Linux (exact); 'en_GB' exact-matches en_GB.lproj.
  electronLanguages: ['en-US', 'en_GB'],

  // electron-builder respects .gitignore by default, which would exclude the
  // `dist/` build output. An explicit files list overrides that behaviour so
  // the renderer, main, and preload bundles are always included in the ASAR.
  // The Go binaries are handled separately via extraResources and are never
  // inside the ASAR, so they don't appear here.
  // Register the app as the OS handler for proxychecker:// URLs.
  // Used by the browser extension to open a specific proxy in the checker.
  // A single scheme covers both stable and canary builds — whichever is
  // installed last wins the OS registration, which is acceptable.
  protocols: [
    {
      name: 'ProxyScrape Proxy Checker',
      schemes: ['proxychecker'],
    },
  ],

  files: [
    'dist/**',
    'public/icons/**',
    'package.json',
  ],

  directories: {
    output: 'release',
  },

  // Binaries and update metadata (.yml files) are hosted on Cloudflare R2,
  // not as GitHub Release assets. GitHub Releases are created separately
  // (see release.yml) and serve as the changelog/release notes only.
  //
  // Channel is derived from the version:
  //   2.0.7         → stable  → https://updates.proxyscrape.com/stable/  → latest.yml
  //   2.0.8-canary  → canary  → https://updates.proxyscrape.com/canary/  → canary.yml
  publish: [
    {
      provider: 'generic',
      url: `${process.env.R2_PUBLIC_URL}/${isCanary ? 'canary' : 'stable'}`,
      channel: isCanary ? 'canary' : 'latest',
      // Cloudflare R2 does not support multipart byte-range requests, so the
      // default multi-range differential downloader always fails with a 400 and
      // falls back to a full installer download with no progress events. Setting
      // this to false makes electron-updater use sequential single-range requests
      // instead — R2 handles those correctly, differential downloads actually
      // work, and download-progress events fire on Windows.
      useMultipleRangeRequest: false,
    },
  ],

  mac: {
    icon: './public/icons/icon.icns',
    category: 'public.app-category.utilities',
    artifactName: '${name}-v${version}-${arch}-${os}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    // 'binaries' explicitly signs these bundled executables with the Developer ID
    // during the mac build step. All four paths are listed; electron-builder skips
    // any that don't exist in the staged .app (statOrNull check), so the wrong-arch
    // entry is safely ignored when extraResources only copies one arch's binary.
    binaries: [
      'bin/checker-darwin-arm64',
      'bin/checker-darwin-x64',
      'bin/proxychecker-host-darwin-arm64',
      'bin/proxychecker-host-darwin-x64',
    ],
    // ${arch} expands to 'arm64' or 'x64' per build target — each DMG/zip only
    // bundles the binary matching its architecture, saving ~30-50 MB per download.
    extraResources: [
      { from: 'bin/checker-darwin-${arch}',           to: 'bin/checker-darwin-${arch}'           },
      { from: 'bin/proxychecker-host-darwin-${arch}', to: 'bin/proxychecker-host-darwin-${arch}' },
    ],
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
  },

  afterSign: 'scripts/notarize.js',

  win: {
    icon: './public/icons/icon.ico',
    artifactName: '${name}-v${version}-${arch}-${os}-installer.${ext}',
    // ${arch} expands to 'arm64' or 'x64' per build target — each installer only
    // bundles the binary matching its architecture, saving ~25-40 MB per download.
    extraResources: [
      { from: 'bin/checker-win-${arch}.exe',              to: 'bin/checker-win-${arch}.exe'              },
      { from: 'bin/proxychecker-host-win-${arch}.exe',    to: 'bin/proxychecker-host-win-${arch}.exe'    },
    ],
    target: [
      { target: 'nsis',     arch: ['x64', 'arm64'] },
      { target: 'portable', arch: ['x64', 'arm64'] },
    ],
  },

  linux: {
    icon: './public/icons/icon.png',
    category: 'Network',
    artifactName: '${name}-v${version}-${arch}-${os}.${ext}',
    // ${arch} expands to 'arm64' or 'x64' per build target — each AppImage only
    // bundles the binary matching its architecture, saving ~25-40 MB per download.
    extraResources: [
      { from: 'bin/checker-linux-${arch}',              to: 'bin/checker-linux-${arch}'              },
      { from: 'bin/proxychecker-host-linux-${arch}',    to: 'bin/proxychecker-host-linux-${arch}'    },
    ],
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
    ],
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    buildUniversalInstaller: false,
    include: 'build/uninstall.nsh',
  },

  portable: {
    artifactName: '${name}-v${version}-${arch}-${os}-portable.${ext}',
  },
};
