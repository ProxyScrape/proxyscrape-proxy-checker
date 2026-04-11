import { isDev } from '../../shared/AppConstants';
import { EventEmitter } from 'events';
import Checker from './checker';

EventEmitter.defaultMaxListeners = 0;

if (!isDev) {
    process.on('uncaughtException', () => null);
}

/**
 * Static facade for the proxy checking engine.
 *
 * Holds a single {@link Checker} instance and exposes start/stop controls
 * consumed by Redux actions. Only one check can run at a time.
 */
export default class Core {
    /** @type {Checker} */
    static checker;

    /** Stops the current check and dispatches partial results. */
    static stop() {
        this.checker.stop();
    }

    /**
     * Creates a new {@link Checker} and begins checking proxies.
     * @param {import('./checker').ProxyObject[]} proxies - Parsed proxy list
     * @param {import('./checker').CheckerOptions} options - Checker settings
     * @param {import('./judges').default} judges - Initialized Judges instance
     * @param {string[]} checkProtocols - Protocols to test
     * @param {string} ip - The user's real IP address
     * @param {import('./blacklist').default|null} blacklist - Initialized Blacklist, or null
     */
    static start(proxies, options, judges, checkProtocols, ip, blacklist) {
        this.checker = new Checker(proxies, options, ip, judges, checkProtocols, blacklist);
        this.checker.start();
    }
}
