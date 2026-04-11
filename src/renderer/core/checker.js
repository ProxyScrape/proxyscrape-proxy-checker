import axios from 'axios';
import store from '../store';
import { lookup } from './country';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { openChecking, upCounterStatus } from '../actions/CheckingActions';
import { showResult } from '../actions/ResultActions';
import { isIP } from '../misc/regexes.js';

/**
 * @typedef {Object} ProxyObject
 * @property {string} type - Proxy type identifier (e.g. 'http', 'socks5')
 * @property {string} auth - Auth string as 'user:pass', or 'none' if unauthenticated
 * @property {string} host - Proxy IP address or hostname
 * @property {string} port - Proxy port number
 */

/**
 * @typedef {Object} CheckerOptions
 * @property {number} timeout - Request timeout in milliseconds
 * @property {number} threads - Max concurrent proxy checks
 * @property {number} retries - Number of retries on network errors (not HTTP errors)
 * @property {boolean} keepAlive - Whether to detect keep-alive support
 * @property {boolean} captureServer - Whether to detect proxy server software
 * @property {boolean} captureFullData - Whether to store full response data per protocol
 */

/**
 * Concurrent proxy checker engine.
 *
 * Checks a queue of proxies against judge servers to determine which protocols
 * each proxy supports, its anonymity level, geo-location, and optional metadata
 * (server software, keep-alive, full response data).
 *
 * Concurrency is controlled by `options.threads` — that many proxies are checked
 * simultaneously. Each proxy is tested against every protocol in `targetProtocols`.
 * Once all protocols finish for a proxy, the next proxy in the queue is started.
 *
 * Results are dispatched to Redux via {@link showResult} when all proxies complete
 * or {@link stop} is called.
 */
export default class Checker {
    /**
     * @param {ProxyObject[]} proxies - Parsed proxy list to check
     * @param {CheckerOptions} options - Checker configuration
     * @param {string} ip - The user's real IP (used for anonymity detection)
     * @param {import('./judges').default} judges - Initialized Judges instance
     * @param {string[]} targetProtocols - Protocols to test (e.g. ['http','https','socks4','socks5'])
     * @param {import('./blacklist').default|null} blacklist - Initialized Blacklist instance, or null
     */
    constructor(proxies, options, ip, judges, targetProtocols, blacklist) {
        this.ip = ip;
        this.doneLevel = targetProtocols.length;
        this.states = {};
        this.stopped = false;
        this.queue = proxies;
        this.judges = judges;
        this.options = options;
        this.blacklist = blacklist;
        this.currentProxy = 0;

        this.timeout = Number(this.options.timeout);
        this.defaultHeaders = options.keepAlive ? { connection: 'keep-alive' } : {};

        this.counter = {
            all: this.queue.length,
            done: 0,
            protocols: {
                ...(targetProtocols.includes('http') ? { http: 0 } : {}),
                ...(targetProtocols.includes('https') ? { https: 0 } : {}),
                ...(targetProtocols.includes('socks4') ? { socks4: 0 } : {}),
                ...(targetProtocols.includes('socks5') ? { socks5: 0 } : {})
            }
        };

        this.check = this.buildCheck(targetProtocols);

        this.upCounterStatus = setInterval(() => {
            store.dispatch(upCounterStatus(this.counter));
        }, 250);
    }

    /**
     * Creates a fresh state entry for a proxy before checking begins.
     * Initialises the `permanent` object that accumulates results across protocols.
     * @param {ProxyObject} proxy
     */
    initializeProxyState({ type, auth, host, port }) {
        this.states[this.getProxyObjectLink({ type, auth, host, port })] = {
            doneLevel: 0,
            info: {
                type,
                auth,
                host,
                port
            },
            permanent: {
                anon: 'elite',
                ip: null,
                protocols: [],
                timeout: 0,
                ...(this.options.captureServer ? { server: null } : {}),
                ...(this.options.keepAlive ? { keepAlive: false } : {}),
                ...(this.options.captureFullData ? { data: [] } : {})
            }
        };
    }

    /**
     * Builds a unique key for a proxy to index into `this.states`.
     * @param {ProxyObject} proxy
     * @returns {string}
     */
    getProxyObjectLink({ type, auth, host, port }) {
        return `${type}${auth}${host}${port}`;
    }

    /**
     * Sends a request through the proxy to a judge server for a single protocol.
     * On success calls {@link onResponse}; on failure calls {@link onError}.
     * @param {ProxyObject} proxyObject
     * @param {string} protocol - 'http' | 'https' | 'socks4' | 'socks5'
     * @param {number} [retries=0] - Current retry count
     */
    async checkProtocol(proxyObject, protocol, retries = 0) {
        try {
            const judge = protocol === 'http' ? this.judges.getUsual() : protocol === 'https' ? this.judges.getSSL() : this.judges.getAny();
            const agentConfig = this.getAgent(proxyObject, protocol);

            const startTime = Date.now();
            const response = await axios.get(judge, {
                timeout: this.timeout,
                headers: this.defaultHeaders,
                responseType: 'text',
                ...agentConfig
            });
            const elapsedTime = Date.now() - startTime;

            this.onResponse({ ...response, elapsedTime }, proxyObject, protocol, judge);
        } catch (error) {
            this.onError(proxyObject, protocol, retries, error.response?.status);
        }
    }

    /**
     * Extracts the remote IP address from a judge response body.
     * Handles both plain-IP responses and PHP-style REMOTE_ADDR output.
     * @param {string} body - Judge response body
     * @returns {string|null} The extracted IP, or null if not found
     */
    getIp(body) {
        const trimmed = body.trim();

        if (isIP(trimmed)) {
            return trimmed;
        }

        const findIp = /REMOTE_ADDR = (.*)/.exec(trimmed);

        if (isIP(findIp[1])) {
            return findIp[1];
        }

        return null;
    }

    /**
     * Builds the axios proxy/agent config for a given protocol.
     * SOCKS proxies use `SocksProxyAgent`; HTTP(S) proxies use axios' built-in proxy option.
     * @param {ProxyObject} proxyObject
     * @param {string} protocol
     * @returns {Object} Axios request config fragment (proxy or httpAgent/httpsAgent)
     */
    getAgent({ auth, host, port }, protocol) {
        if (auth !== 'none') {
            if (protocol === 'socks4' || protocol === 'socks5') {
                const agent = new SocksProxyAgent(`${protocol}://${auth}@${host}:${port}`, { timeout: this.timeout });
                return { httpAgent: agent, httpsAgent: agent };
            }

            const [username, password] = auth.split(':');
            return { proxy: { host, port: Number(port), auth: { username, password }, protocol: 'http' } };
        }

        if (protocol === 'socks4' || protocol === 'socks5') {
            const agent = new SocksProxyAgent(`${protocol}://${host}:${port}`, { timeout: this.timeout });
            return { httpAgent: agent, httpsAgent: agent };
        }

        return { proxy: { host, port: Number(port), protocol: 'http' } };
    }

    /**
     * Detects proxy server software by matching known signatures in the response body.
     * @param {string} body - Judge response body
     * @returns {string|null} Server name (e.g. 'squid', 'mikrotik') or null
     */
    getServer(body) {
        if (body.match(/squid/i)) {
            return 'squid';
        }

        if (body.match(/mikrotik/i)) {
            return 'mikrotik';
        }

        if (body.match(/tinyproxy/i)) {
            return 'tinyproxy';
        }

        if (body.match(/litespeed/i)) {
            return 'litespeed';
        }

        if (body.match(/varnish/i)) {
            return 'varnish';
        }

        if (body.match(/haproxy/i)) {
            return 'haproxy';
        }

        return null;
    }

    /**
     * Determines anonymity level by inspecting the judge response for IP leakage
     * and proxy-revealing headers.
     * @param {string} body - Judge response body
     * @returns {'transparent'|'anonymous'|'elite'}
     */
    getAnon(body) {
        if (body.match(new RegExp(this.ip))) {
            return 'transparent';
        }

        if (body.match(/HTTP_VIA|PROXY_REMOTE_ADDR/i)) {
            return 'anonymous';
        }

        return 'elite';
    }

    /**
     * Updates the keep-alive flag for a proxy if the response indicates support.
     * @param {string} proxyLink - State key from {@link getProxyObjectLink}
     * @param {Object} headers - Response headers
     */
    setKeepAlive(proxyLink, headers) {
        if (!this.states[proxyLink].permanent.keepAlive && (headers['keep-alive'] || headers['connection'] === 'keep-alive')) {
            this.states[proxyLink].permanent.keepAlive = true;
        }
    }

    /**
     * Handles a successful judge response. Validates the body, then records
     * protocol support, anonymity, timeout, and optional metadata (server, keep-alive,
     * full data). Increments the protocol counter and checks completion.
     * @param {Object} response - Axios response augmented with `elapsedTime`
     * @param {ProxyObject} proxyObject
     * @param {string} protocol
     * @param {string} judge - The judge URL used for this check
     */
    onResponse(response, proxyObject, protocol, judge) {
        if (this.stopped) {
            return;
        }

        const proxyLink = this.getProxyObjectLink(proxyObject);

        if (this.judges.validate(response.data, judge)) {
            this.states[proxyLink].permanent.timeout = response.elapsedTime;
            this.states[proxyLink].permanent.ip = this.getIp(response.data);

            let anon = 'elite';

            if (protocol === 'http') {
                anon = this.getAnon(response.data);
                this.states[proxyLink].permanent.anon = anon;

                if (this.options.captureServer) {
                    this.states[proxyLink].permanent.server = this.getServer(response.data);
                }
            }

            if (this.options.keepAlive) {
                this.setKeepAlive(proxyLink, response.headers);
            }

            if (this.options.captureFullData) {
                this.states[proxyLink].permanent.data.push({
                    protocol,
                    elapsedTime: response.elapsedTime,
                    anon,
                    judge: response.config.url,
                    response: {
                        body: response.data,
                        headers: response.headers
                    }
                });
            }

            this.states[proxyLink].permanent.protocols.push(protocol);
            this.counter.protocols[protocol]++;
        }

        this.states[proxyLink].doneLevel++;
        this.isDone(proxyLink);
    }

    /**
     * Handles a failed protocol check. Retries on network errors (no HTTP status code)
     * up to `options.retries` times; otherwise marks the protocol as done.
     * @param {ProxyObject} proxyObject
     * @param {string} protocol
     * @param {number} retries - How many retries have been attempted so far
     * @param {number|undefined} statusCode - HTTP status if available
     */
    onError(proxyObject, protocol, retries, statusCode) {
        if (this.stopped) {
            return;
        }

        const proxyLink = this.getProxyObjectLink(proxyObject);

        if (!statusCode && this.options.retries > 0 && retries < this.options.retries) {
            this.checkProtocol(proxyObject, protocol, ++retries);
        } else {
            this.states[proxyLink].doneLevel++;
            this.isDone(proxyLink);
        }
    }

    /**
     * Returns a check function optimized for the number of target protocols.
     * Single-protocol and all-four-protocol cases avoid forEach overhead.
     * @param {string[]} protocols
     * @returns {function(ProxyObject): void}
     */
    buildCheck(protocols) {
        if (protocols.length === 1) {
            return proxyObject => {
                this.checkProtocol(proxyObject, protocols[0]);
            };
        }

        if (protocols.length === 4) {
            return proxyObject => {
                this.checkProtocol(proxyObject, 'http');
                this.checkProtocol(proxyObject, 'https');
                this.checkProtocol(proxyObject, 'socks4');
                this.checkProtocol(proxyObject, 'socks5');
            };
        }

        return proxyObject => {
            protocols.forEach(protocol => {
                this.checkProtocol(proxyObject, protocol);
            });
        };
    }

    /**
     * Collects final results from all proxy states. Only proxies with at least
     * one working protocol are included. Each result is enriched with geo-location
     * and optional blacklist data.
     * @returns {{ items: Object[], inBlacklists: Object[]|false }}
     */
    getResult() {
        const result = [];

        for (let proxy in this.states) {
            const { type, host, port, auth } = this.states[proxy].info;
            const proxyState = this.states[proxy].permanent;
            const country = lookup(proxyState.ip);

            if (proxyState.protocols.length > 0) {
                result.push({
                    type,
                    host,
                    port,
                    auth,
                    country,
                    ...(this.blacklist ? { blacklist: this.blacklist.check(host) } : false),
                    ...proxyState
                });
            }
        }

        return {
            items: result,
            inBlacklists: this.blacklist ? this.blacklist.getInListsCounter() : false
        };
    }

    /**
     * Called when all protocols for a proxy have finished. Increments the done
     * counter and either dispatches the final result or starts the next proxy.
     * @param {string} proxyLink - State key from {@link getProxyObjectLink}
     */
    isDone(proxyLink) {
        if (this.states[proxyLink].doneLevel === this.doneLevel) {
            this.counter.done++;

            if (this.counter.done === this.counter.all) {
                this.dispatchResult();
            } else {
                this.run();
            }
        }
    }

    /**
     * Dequeues the next proxy, initializes its state, and starts checking it.
     * No-ops if the entire queue has been consumed.
     */
    run() {
        if (this.currentProxy === this.counter.all) {
            return;
        }

        const proxy = this.queue[this.currentProxy++];

        this.initializeProxyState(proxy);
        this.check(proxy);
    }

    /** Clears the counter interval and dispatches final results to Redux. */
    dispatchResult() {
        clearInterval(this.upCounterStatus);
        store.dispatch(showResult(this.getResult()));
    }

    /** Stops checking immediately and dispatches whatever results exist so far. */
    stop() {
        this.stopped = true;
        this.dispatchResult();
    }

    /**
     * Opens the checking overlay and starts `threads` concurrent workers
     * after a short delay (allows the UI to render the overlay first).
     */
    start() {
        store.dispatch(openChecking(this.counter));
        const startThreadsCount = this.queue.length > this.options.threads ? this.options.threads : this.queue.length;

        setTimeout(() => {
            for (let index = 0; index < startThreadsCount; index++) {
                this.run();
            }
        }, 300);
    }
}
