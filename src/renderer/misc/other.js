export const psUrl = (path, campaign) => {
    const base = 'https://proxyscrape.com' + path;
    const sep = path.includes('?') ? '&' : '?';
    const medium = (typeof window !== 'undefined' && window.__ELECTRON__) ? 'desktop-app' : 'web-app';
    return base + sep + `utm_source=proxy-checker&utm_medium=${medium}&utm_campaign=${campaign}`;
};

export const getMaxThreads = protocols => {
    const enabledProtocols = Object.keys(protocols).filter(protocol => protocols[protocol]);

    if (enabledProtocols.length > 3) {
        return 500;
    } else if (enabledProtocols.length > 2) {
        return 650;
    } else if (enabledProtocols.length > 1) {
        return 1000;
    } else {
        return 1850;
    }
};
