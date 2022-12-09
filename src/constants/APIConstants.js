const LATEST_RELEASES_API_PATH = 'https://api.github.com/repos/ProxyScrape/proxy-checker/releases';
const CHECK_ONLINE_API_PATH = 'https://api.proxyscrape.com/v2/analytics/proxy-checker.php';
const CHECK_AUTH_AIP_PATH = 'https://api.proxyscrape.com/v2/analytics/proxy-checker.php';

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
        user_online: true
    },
    timeout: 10000,
    headers: {
        'User-Agent': 'ProxyScrape Version Lookup'
    }
}

export const CHECK_AUTH = {
    url: CHECK_ONLINE_API_PATH,
    json: {
        user_ip: ""
    },
    timeout: 10000,
    headers: {
        'User-Agent': 'ProxyScrape Version Lookup'
    }
}