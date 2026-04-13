import { isIP } from './regexes.js';

const KNOWN_PROTOCOLS = ['http', 'https', 'socks4', 'socks5'];

const extractScheme = raw => {
    const match = /^(\w+):\/\//.exec(raw.trim());
    if (!match) return '';
    const scheme = match[1].toLowerCase();
    return KNOWN_PROTOCOLS.includes(scheme) ? scheme : '';
};

/**
 * Parses a single proxy string into { host, port, auth, type, protocol } or null.
 *
 * Supported formats (scheme prefix is optional):
 *   ip:port
 *   host:port
 *   user:pass@host:port
 *   host:port:user:pass
 *   scheme://host:port
 *   scheme://user:pass@host:port
 *
 * `protocol` is the declared scheme if it maps to a known protocol ('http',
 * 'https', 'socks4', 'socks5'), or '' when no scheme is present.
 */
const parseProxy = raw => {
    const s = raw.trim();
    if (!s) return null;

    const protocol = extractScheme(s);
    const withoutScheme = s.replace(/^\w+:\/\//, '');

    // Pattern A: user:pass@host:port
    const withPrefixAuth = /^([^:@]+):([^@]*)@([^:]+):(\d{1,5})$/.exec(withoutScheme);
    if (withPrefixAuth) {
        const port = Number(withPrefixAuth[4]);
        if (port < 1 || port > 65535) return null;
        return {
            type: isIP(withPrefixAuth[3]) ? 'v4' : 'url',
            auth: `${withPrefixAuth[1]}:${withPrefixAuth[2]}`,
            host: withPrefixAuth[3],
            port,
            protocol,
        };
    }

    // Pattern B: host:port:user:pass
    const withTrailingAuth = /^([^:]+):(\d{1,5}):([^:]+):(.+)$/.exec(withoutScheme);
    if (withTrailingAuth) {
        const port = Number(withTrailingAuth[2]);
        if (port < 1 || port > 65535) return null;
        return {
            type: isIP(withTrailingAuth[1]) ? 'v4' : 'url',
            auth: `${withTrailingAuth[3]}:${withTrailingAuth[4]}`,
            host: withTrailingAuth[1],
            port,
            protocol,
        };
    }

    // Pattern C: host:port (no auth)
    const bare = /^([^:]+):(\d{1,5})$/.exec(withoutScheme);
    if (bare) {
        const port = Number(bare[2]);
        if (port < 1 || port > 65535) return null;
        return {
            type: isIP(bare[1]) ? 'v4' : 'url',
            auth: 'none',
            host: bare[1],
            port,
            protocol,
        };
    }

    return null;
};

const getParseErrorReason = string => {
    const s = string.trim();

    if (!s) return 'Empty line';
    if (s.startsWith('#') || s.startsWith('//')) return 'Comment line, not a proxy';

    const ipMatch = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/);
    if (ipMatch) {
        const octets = ipMatch.slice(1).map(Number);
        if (octets.some(o => o > 255)) {
            return `IP octet exceeds 255 (${octets.find(o => o > 255)})`;
        }
    }

    const portMatch = s.match(/:(\d+)/g);
    if (!portMatch) return 'Missing port number — expected ip:port or protocol://ip:port';

    const ports = portMatch.map(p => Number(p.slice(1)));
    const outOfRange = ports.find(p => p > 65535);
    if (outOfRange) return `Port ${outOfRange} out of range (max 65535)`;

    if (/\s/.test(s)) return 'Contains unexpected whitespace';

    return 'Unrecognized format — expected ip:port or protocol://ip:port';
};

const findMixedProxies = array => {
    const successed = [];
    const failed = [];

    for (const string of array) {
        const result = parseProxy(string);
        if (result) {
            successed.push(result);
        } else {
            failed.push({ line: string, reason: getParseErrorReason(string) });
        }
    }

    return { successed, failed };
};

export default findMixedProxies;
