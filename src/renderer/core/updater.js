import axios from 'axios';

import { FETCH_URL, FETCH_CONFIG, CHECK_ONLINE_URL, CHECK_ONLINE_DATA, CHECK_ONLINE_CONFIG } from '../constants/UpdateConstants';
import { version } from '../../../package.json';

export const currentVersion = version;

/**
 * Fetches release info from the GitHub API and determines if a newer
 * version is available. Returns release notes for the Info drawer and
 * a portable download asset when an update exists.
 * @returns {Promise<{ available?: boolean, releases: Object[], portableAsset?: Object }|false>}
 *   Release info object, or false if the fetch fails entirely
 */
export const getLatestVersionInfo = async () => {
    try {
        const { data: releases } = await axios.get(FETCH_URL, FETCH_CONFIG);
        const [latest] = releases;
        const version = latest.tag_name.slice(1);

        if (version > currentVersion) {
            const [portableAsset] = latest.assets.filter(asset => asset.name.match(/portable/i));

            return {
                available: true,
                releases,
                portableAsset
            };
        } else {
            return {
                releases
            };
        }
    } catch {
        return false;
    }
};

/**
 * Sends a heartbeat to the online-check endpoint and starts a 60-second
 * interval to keep reporting. Used for anonymous online-user counting.
 */
export const sendOnlineInfo = async () => {
    try {
        axios.post(CHECK_ONLINE_URL, CHECK_ONLINE_DATA, CHECK_ONLINE_CONFIG);
        let myInterval = setInterval(() => {
            axios.post(CHECK_ONLINE_URL, CHECK_ONLINE_DATA, CHECK_ONLINE_CONFIG);
        }, 60000);
    } catch {
        return false;
    }
};
