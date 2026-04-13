// Settings persistence is now handled by the Go backend via GET/PUT /api/settings.
// These constants define default Redux state used before the first loadSettings() completes.

export const DEFAULT_CORE_SETTINGS = {
    threads: 350,
    keepAlive: false,
    timeout: 15000,
    retries: 0,
    shuffle: false,
    captureFullData: false,
    captureServer: false,
    captureTrace: false,
    localDns: false,
    overrideProtocols: false,
    protocols: {
        http: true,
        https: true,
        socks4: true,
        socks5: true
    },
    protocolWarning: {
        open: false,
        listProtocols: [],
        selectedProtocols: []
    }
};

export const DEFAULT_JUDGES_SETTINGS = {
    swap: true,
    items: [
        {
            active: true,
            url: 'http://judge1.api.proxyscrape.com',
            validate: 'AZ Environment variables'
        },
        {
            active: true,
            url: 'http://judge2.api.proxyscrape.com',
            validate: 'AZ Environment variables'
        },
        {
            active: true,
            url: 'http://judge3.api.proxyscrape.com',
            validate: 'AZ Environment variables'
        },
        {
            active: true,
            url: 'http://judge4.api.proxyscrape.com',
            validate: 'AZ Environment variables'
        },
        {
            active: true,
            url: 'http://judge5.api.proxyscrape.com',
            validate: 'AZ Environment variables'
        },
        {
            active: true,
            url: 'https://ssl-judge1.api.proxyscrape.com',
            validate: 'REMOTE_ADDR = (25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'
        },
        {
            active: true,
            url: 'https://ssl-judge2.api.proxyscrape.com',
            validate: 'REMOTE_ADDR = (25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'
        }
    ]
};

export const DEFAULT_IP_SETTINGS = {
    current: '',
    lookupUrl: 'https://api.proxyscrape.com/ip.php'
};

export const DEFAULT_BLACKLIST_SETTINGS = {
    filter: false,
    items: [
        {
            title: 'Spamhaus DROP',
            active: true,
            path: 'https://www.spamhaus.org/drop/drop.txt'
        },
        {
            title: 'Spamhaus EDROP',
            active: true,
            path: 'https://www.spamhaus.org/drop/edrop.txt'
        },
        {
            title: 'MYIP.MS General',
            active: true,
            path: 'https://myip.ms/files/blacklist/general/latest_blacklist.txt'
        }
    ]
};

export const DEFAULT_EXPORTING_SETTINGS = {
    type: 1
};

export const DEFAULT_MAIN_SETTINGS = {};

export const MERGED_DEFAULT_SETTINGS = {
    core: DEFAULT_CORE_SETTINGS,
    judges: DEFAULT_JUDGES_SETTINGS,
    ip: DEFAULT_IP_SETTINGS,
    blacklist: DEFAULT_BLACKLIST_SETTINGS,
    exporting: DEFAULT_EXPORTING_SETTINGS,
    main: DEFAULT_MAIN_SETTINGS
};
