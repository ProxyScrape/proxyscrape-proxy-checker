import { v4 as uuidv4 } from 'uuid';

const LATEST_RELEASES_API_PATH = 'https://api.github.com/repos/ProxyScrape/proxy-checker/releases';
const CHECK_ONLINE_API_PATH = 'https://api.proxyscrape.com/v2/analytics/proxy-checker.php';
const SESSION_ID = uuidv4();

export const FETCH_URL = LATEST_RELEASES_API_PATH;
export const FETCH_CONFIG = {
    timeout: 10000
};

export const CHECK_ONLINE_URL = CHECK_ONLINE_API_PATH;
export const CHECK_ONLINE_DATA = {
    user_online: true,
    session_id: SESSION_ID
};
export const CHECK_ONLINE_CONFIG = {
    timeout: 10000
};
