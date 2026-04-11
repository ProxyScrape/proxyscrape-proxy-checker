import url from 'url';
import { isIP } from './regexes.js';

const getProxyType = string => {
    try {
        const first = /^(?:(\w+)(?::(\w+))?@)?((?:\d{1,3})(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(string);

        if (first) {
            const log = first[1];
            const pass = first[2];

            return {
                type: 'v4',
                auth: log && pass ? `${log}:${pass}` : 'none',
                host: first[3],
                port: Number(first[4])
            };
        }

        const second = url.parse(!string.startsWith('http') ? `http://${string}` : string);

        if (second) {
            if (!second.port) {
                const [port, log, pass] = second.path
                    .replaceAll('/', '')
                    .split(':')
                    .filter(item => item.length > 0);

                const nextPort = Number(port);

                if (nextPort >= 0 && nextPort <= 65535) {
                    return {
                        type: isIP(second.hostname) ? 'v4' : 'url',
                        auth: `${log}:${pass}`,
                        host: second.hostname,
                        port: nextPort
                    };
                }

                return null;
            }

            return {
                type: isIP(second.hostname) ? 'v4' : 'url',
                auth: second.auth ? second.auth : 'none',
                host: second.hostname,
                port: Number(second.port)
            };
        }

        return null;
    } catch {
        return null;
    }
};

const getParseErrorReason = (string) => {
    const trimmed = string.trim();

    if (!trimmed) return 'Empty line';
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return 'Comment line, not a proxy';

    const hasIPPattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(trimmed);
    const portMatch = trimmed.match(/:(\d+)(?:\s|$|\/)/);
    const trailingPortMatch = trimmed.match(/:(\d+)$/);

    if (hasIPPattern) {
        const ipMatch = trimmed.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/);
        if (ipMatch) {
            const octets = [parseInt(ipMatch[1]), parseInt(ipMatch[2]), parseInt(ipMatch[3]), parseInt(ipMatch[4])];
            if (octets.some(o => o > 255)) {
                return 'IP octet exceeds 255 (e.g. ' + octets.find(o => o > 255) + ')';
            }
        }

        const anyPort = portMatch || trailingPortMatch;
        if (!anyPort) {
            return 'Missing port number — expected ip:port';
        }

        if (anyPort) {
            const port = parseInt(anyPort[1]);
            if (port > 65535) {
                return 'Port ' + port + ' out of range (max 65535)';
            }
        }
    }

    if (!hasIPPattern) {
        const hasHostname = /[a-zA-Z]/.test(trimmed);
        if (!hasHostname) {
            return 'No valid IP address found';
        }
        if (!portMatch && !trailingPortMatch) {
            return 'Missing port number';
        }
    }

    if (/\s{2,}/.test(trimmed) || /\t/.test(trimmed)) {
        return 'Contains unexpected whitespace or tabs';
    }

    return 'Unrecognized format — expected ip:port or protocol://ip:port';
};

const findMixedProxies = array => {
    const successed = [];
    const failed = [];

    for (const string of array) {
        const result = getProxyType(string);

        if (result) {
            successed.push(result);
        } else {
            failed.push({
                line: string,
                reason: getParseErrorReason(string),
            });
        }
    }

    return {
        successed,
        failed
    };
};

export default findMixedProxies;
