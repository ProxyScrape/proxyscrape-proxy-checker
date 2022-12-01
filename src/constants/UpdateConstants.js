import {v4 as uuidv4} from 'uuid';

const LATEST_RELEASES_API_PATH = 'https://api.github.com/repos/ProxyScrape/proxy-checker/releases';
const CHECK_ONLINE_API_PATH = 'https://api.proxyscrape.com/v2/analytics/proxy-checker.php';
const SESSION_ID =  uuidv4();

export const FETCH_CONFIG = {
    url: LATEST_RELEASES_API_PATH,
    json: true,
    timeout: 10000,
    headers: {
        'User-Agent': 'ProxyScrape Version Lookup'
    }
};

export const CHECK_ONLINE = {
    url: CHECK_ONLINE_API_PATH,
    json: {
        user_online: true,
        session_id: SESSION_ID
    },
    timeout: 10000,
    headers: {
        'User-Agent': 'ProxyScrape Version Lookup'
    }
}