/**
 * Latest-redirect Worker
 *
 * Handles all requests to:
 *   https://latest-software.cdn.proxyscrape.com/{channel}/{generic-filename}
 *
 * Reads {channel}/releases.json to find the current version, then issues a
 * 302 redirect to the actual versioned file on R2.
 *
 * Supported generic filenames:
 *   win-x64-installer.exe   win-arm64-installer.exe
 *   win-x64-portable.exe    win-arm64-portable.exe
 *   mac-x64.dmg             mac-arm64.dmg
 *   mac-x64.zip             mac-arm64.zip
 *   linux-x64.AppImage      linux-arm64.AppImage
 */

const APP     = 'proxyscrape-proxy-checker';
const R2_BASE = 'https://software.cdn.proxyscrape.com';

// Maps a generic "latest" filename → the electron-builder artifact name for a given version.
// Naming patterns come from electron-builder.config.js:
//   win:   ${name}-v${version}-${arch}-${os}-installer.exe / -portable.exe
//   mac:   ${name}-v${version}-${arch}-${os}.dmg / .zip
//   linux: ${name}-v${version}-${arch}-${os}.AppImage
function toVersioned(generic, version) {
    const v = `${APP}-v${version}`;
    const map = {
        'win-x64-installer.exe':   `${v}-x64-win-installer.exe`,
        'win-arm64-installer.exe': `${v}-arm64-win-installer.exe`,
        'win-x64-portable.exe':    `${v}-x64-win-portable.exe`,
        'win-arm64-portable.exe':  `${v}-arm64-win-portable.exe`,
        'mac-x64.dmg':             `${v}-x64-mac.dmg`,
        'mac-arm64.dmg':           `${v}-arm64-mac.dmg`,
        'mac-x64.zip':             `${v}-x64-mac.zip`,
        'mac-arm64.zip':           `${v}-arm64-mac.zip`,
        'linux-x64.AppImage':      `${v}-x64-linux.AppImage`,
        'linux-arm64.AppImage':    `${v}-arm64-linux.AppImage`,
    };
    return map[generic] ?? null;
}

export default {
    async fetch(request) {
        const { pathname } = new URL(request.url);
        // Expected: /{channel}/{file}
        const parts = pathname.split('/').filter(Boolean);

        if (parts.length !== 2) {
            return new Response(
                'Usage: /canary/{file} or /stable/{file}\n\nValid files: win-x64-installer.exe, mac-arm64.dmg, linux-x64.AppImage, etc.',
                { status: 400 },
            );
        }

        const [channel, genericFile] = parts;
        if (channel !== 'canary' && channel !== 'stable') {
            return new Response('Invalid channel — use "canary" or "stable"', { status: 400 });
        }

        // Fetch releases.json with short edge cache to avoid hammering R2 on
        // every request while still reflecting new releases within a minute.
        let releases;
        try {
            const res = await fetch(`${R2_BASE}/${channel}/releases.json`, {
                cf: { cacheTtl: 60 },
            });
            if (!res.ok) return new Response('releases.json unavailable', { status: 502 });
            releases = await res.json();
        } catch {
            return new Response('Failed to load releases.json', { status: 502 });
        }

        const version = releases?.[0]?.version;
        if (!version) return new Response('No releases found', { status: 404 });

        const versioned = toVersioned(genericFile, version);
        if (!versioned) {
            return new Response(
                `Unknown file: ${genericFile}. Valid options: win-x64-installer.exe, mac-arm64.dmg, linux-x64.AppImage, etc.`,
                { status: 404 },
            );
        }

        return Response.redirect(`${R2_BASE}/${channel}/${versioned}`, 302);
    },
};
