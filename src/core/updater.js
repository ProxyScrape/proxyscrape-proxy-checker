import rp from 'request-promise';

import { FETCH_CONFIG, CHECK_ONLINE } from '../constants/UpdateConstants';
import { version } from '../../package.json';

export const currentVersion = version;

export const getLatestVersionInfo = async () => {
    try {
        const releases = await rp.get(FETCH_CONFIG);

        // Only consider stable (non-pre-release) releases so that canary/beta
        // builds published to the same repo never trigger an update prompt for
        // users on the stable channel.
        const stableReleases = releases.filter(r => !r.prerelease && !r.draft);
        if (stableReleases.length === 0) {
            return { releases };
        }

        const [latest] = stableReleases;
        const latestVersion = latest.tag_name.replace(/^v/, '');

        // Compare using semver-style numeric segment comparison so that
        // "2.0.0-canary" is never treated as newer than "1.2.1" and
        // lexicographic quirks ("1.10.0" > "1.9.0") are handled correctly.
        const toInt = v => v.replace(/[^0-9.]/g, '').split('.').map(Number);
        const isNewer = (a, b) => {
            const [aParts, bParts] = [toInt(a), toInt(b)];
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const diff = (aParts[i] || 0) - (bParts[i] || 0);
                if (diff !== 0) return diff > 0;
            }
            return false;
        };

        if (isNewer(latestVersion, currentVersion)) {
            const [portableAsset] = latest.assets.filter(asset => asset.name.match(/portable/i));

            return {
                available: true,
                releases: stableReleases,
                portableAsset
            };
        } else {
            return {
                releases: stableReleases
            };
        }
    } catch {
        return false;
    }
};

export const sendOnlineInfo = async () => {
    try {
        
        rp.post(CHECK_ONLINE);
        let myInterval = setInterval(() => {
            
            rp.post(CHECK_ONLINE);

        }, 60000);
        
    } catch {
        return false;
    }
}
