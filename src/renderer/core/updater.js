import axios from 'axios';

import { FETCH_URL, FETCH_CONFIG, CHECK_ONLINE_URL, CHECK_ONLINE_DATA, CHECK_ONLINE_CONFIG } from '../constants/UpdateConstants';
import { version } from '../../../package.json';

export const currentVersion = version;

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
