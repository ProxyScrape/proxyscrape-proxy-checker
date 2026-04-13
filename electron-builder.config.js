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

  // electron-builder respects .gitignore by default, which would exclude the
  // `dist/` build output. An explicit files list overrides that behaviour so
  // the renderer, main, and preload bundles are always included in the ASAR.
  // The Go binaries are handled separately via extraResources and are never
  // inside the ASAR, so they don't appear here.
  files: [
    'dist/**',
    'package.json',
  ],

  directories: {
    output: 'release',
  },

  publish: [
    {
      provider: 'github',
      owner: 'ProxyScrape',
      repo: 'proxyscrape-proxy-checker',
      private: false,
    },
  ],

  mac: {
    icon: './public/icons/icon.icns',
    category: 'public.app-category.utilities',
    artifactName: '${name}-v${version}-${arch}-${os}.${ext}',
    binaries: [
      'bin/checker-darwin-arm64',
      'bin/checker-darwin-x64',
    ],
    extraResources: [
      { from: 'bin/checker-darwin-arm64', to: 'bin/checker-darwin-arm64' },
      { from: 'bin/checker-darwin-x64',   to: 'bin/checker-darwin-x64'   },
    ],
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ],
  },

  win: {
    icon: './public/icons/icon.ico',
    artifactName: '${name}-v${version}-${arch}-${os}-installer.${ext}',
    extraResources: [
      { from: 'bin/checker-win-x64.exe',   to: 'bin/checker-win-x64.exe'   },
      { from: 'bin/checker-win-arm64.exe', to: 'bin/checker-win-arm64.exe' },
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
    extraResources: [
      { from: 'bin/checker-linux-x64',   to: 'bin/checker-linux-x64'   },
      { from: 'bin/checker-linux-arm64', to: 'bin/checker-linux-arm64' },
    ],
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
    ],
  },

  nsis: {
    oneClick: false,
    perMachine: true,
    allowToChangeInstallationDirectory: true,
    differentialPackage: true,
  },

  portable: {
    artifactName: '${name}-v${version}-${arch}-${os}-portable.${ext}',
  },
};
