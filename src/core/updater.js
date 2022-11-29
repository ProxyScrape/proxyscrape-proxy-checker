import rp from 'request-promise';
import { FETCH_CONFIG, CHECK_ONLINE } from '../constants/UpdateConstants';
import { version } from '../../package.json';

export const currentVersion = version;

export const getLatestVersionInfo = async () => {
    try {
        const releases = await rp.get(FETCH_CONFIG);
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
        
        rp.post(CHECK_ONLINE);
        let myInterval = setInterval(() => {
            
            rp.post(CHECK_ONLINE);

        }, 60000);
        
    } catch {
        return false;
    }
}
