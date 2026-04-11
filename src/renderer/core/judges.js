import axios from 'axios';
import store from '../store';
import { changeState, changeJudgePingState, startPing } from '../actions/OverlayJudgesActions';
import { wait } from '../misc/wait';
import { arrayToChunks } from './misc.js';

/**
 * @typedef {Object} JudgeConfig
 * @property {JudgeItem[]} items - List of judge URLs to ping
 * @property {boolean} swap - Whether to round-robin across multiple judges of the same type
 */

/**
 * @typedef {Object} JudgeItem
 * @property {string} url - The judge endpoint URL
 * @property {string} validate - Regex string to validate the response body (empty = accept all)
 */

/**
 * Manages judge server availability for proxy checking.
 *
 * Judges are HTTP endpoints that echo back request metadata (IP, headers).
 * The Checker class uses them to determine proxy anonymity and protocol support.
 *
 * On construction, all configured judges are pinged in parallel (chunked in groups
 * of 5). Working judges are categorised into SSL (HTTPS) and usual (HTTP) lists.
 * The constructor returns a Promise that resolves with the Judges instance once
 * all pings complete and at least the required judge types are available.
 *
 * During checking, {@link getSSL}, {@link getUsual}, and {@link getAny} return
 * judge URLs. When `swap` is enabled they round-robin across available judges
 * to distribute load.
 */
export default class Judges {
    /**
     * Pings all judge URLs and resolves when ready.
     * @param {JudgeConfig} config
     * @param {string[]} targetProtocols - Protocols the checker will test (determines which judge types are required)
     * @returns {Promise<Judges>} Resolves with this instance once all judges are pinged
     */
    constructor(config, targetProtocols) {
        this.usingStatus = {
            ssl: {
                current: 0,
                max: null
            },
            usual: {
                current: 0,
                max: null
            },
            any: {
                current: 0,
                max: null
            }
        };

        this.swap = config.swap;
        this.targetProtocols = targetProtocols;

        this.counter = {
            all: config.items.length,
            done: 0
        };

        this.list = {
            ssl: [],
            usual: [],
            any: []
        };

        this.data = {
        };

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.launch(config.items);
        }).catch(error => alert(error));
    }

    /**
     * Builds the {@link getSSL} function. Returns a static or round-robin getter
     * depending on how many SSL judges are available and whether `swap` is enabled.
     * @returns {function(): string}
     */
    buildGetSSL() {
        if (this.list.ssl.length == 1 || !this.swap) {
            return () => this.list.ssl[0];
        }

        return () => {
            const current = this.list.ssl[this.usingStatus.ssl.current];
            this.usingStatus.ssl.current = this.usingStatus.ssl.current == this.usingStatus.ssl.max - 1 ? 0 : this.usingStatus.ssl.current + 1;

            return current;
        };
    }

    /**
     * Builds the {@link getAny} function (round-robin across all working judges).
     * Used for SOCKS protocol checks where either HTTP or HTTPS judges work.
     * @returns {function(): string}
     */
    buildGetAny() {
        if (this.list.any.length == 1 || !this.swap) {
            return () => this.list.any[0];
        }

        return () => {
            const current = this.list.any[this.usingStatus.any.current];
            this.usingStatus.any.current = this.usingStatus.any.current == this.usingStatus.any.max - 1 ? 0 : this.usingStatus.any.current + 1;

            return current;
        };
    }

    /**
     * Builds the {@link getUsual} function (round-robin across HTTP-only judges).
     * @returns {function(): string}
     */
    buildGetUsual() {
        if (this.list.usual.length == 1 || !this.swap) {
            return () => this.list.usual[0];
        }

        return () => {
            const current = this.list.usual[this.usingStatus.usual.current];
            this.usingStatus.usual.current = this.usingStatus.usual.current == this.usingStatus.usual.max - 1 ? 0 : this.usingStatus.usual.current + 1;

            return current;
        };
    }

    /**
     * Validates a judge response body against the judge's configured regex.
     * If no validate pattern is set, all responses are accepted.
     * @param {string} body - Response body from the judge
     * @param {string} judge - Judge URL (used to look up the validation regex)
     * @returns {boolean}
     */
    validate(body, judge) {
        if (this.data[judge].validate.length > 0) {
            return body.match(new RegExp(this.data[judge].validate));
        }

        return true;
    }

    /**
     * Pings all judges in parallel (chunked into groups of 5 to limit concurrency).
     * Updates the overlay UI with ping results as they complete.
     * @param {JudgeItem[]} list
     */
    async launch(list) {
        store.dispatch(startPing());
        await wait(1500);

        for await (const chunk of arrayToChunks(list, 5)) {
            await Promise.all(
                chunk.map(async judge => {
                    try {
                        const startTime = Date.now();
                        const response = await axios.get(judge.url, { timeout: 10000, responseType: 'text' });
                        const elapsedTime = Date.now() - startTime;
                        this.onSuccess(judge, { ...response, elapsedTime });
                    } catch {
                        this.onError(judge);
                    }
                })
            );
        }
    }

    /**
     * Records a successful judge ping. Categorises the judge as SSL or usual
     * based on its URL scheme, stores its response data, and updates the overlay.
     * @param {JudgeItem} judge
     * @param {Object} response - Axios response augmented with `elapsedTime`
     */
    onSuccess(judge, response) {
        const typeLink = judge.url.match(/https:\/\//) ? this.list.ssl : this.list.usual;
        typeLink.push(judge.url);

        this.data[judge.url] = {
            ...judge,
            response
        };

        store.dispatch(
            changeJudgePingState(judge.url, {
                state: {
                    checking: false,
                    working: true,
                    timeout: response.elapsedTime
                }
            })
        );

        this.isDone();
    }

    /**
     * Records a failed judge ping and updates the overlay.
     * @param {JudgeItem} judge
     */
    onError(judge) {
        store.dispatch(
            changeJudgePingState(judge.url, {
                state: {
                    checking: false,
                    working: false
                }
            })
        );

        this.isDone();
    }

    /**
     * Checks whether all judges have been pinged. When complete, merges the
     * SSL and usual lists into `any`, builds the round-robin getters, validates
     * that required judge types are present, and resolves the constructor promise.
     */
    async isDone() {
        this.counter.done++;

        if (this.counter.done == this.counter.all) {
            this.checkAtAliveJudges();

            this.list.any = [...this.list.usual, ...this.list.ssl];

            this.usingStatus.ssl.max = this.list.ssl.length;
            this.usingStatus.usual.max = this.list.usual.length;
            this.usingStatus.any.max = this.list.any.length;

            this.getSSL = this.buildGetSSL();
            this.getUsual = this.buildGetUsual();
            this.getAny = this.buildGetAny();

            await wait(1500);
            store.dispatch(changeState({ isActive: false, locked: false }));

            this.resolve(this);
        }
    }

    /**
     * Rejects the constructor promise if required judge types have no working entries.
     * Called once all pings are complete.
     */
    checkAtAliveJudges() {
        if (this.isRequiredSSLButNotContains()) {
            this.reject('You have no working SSL judges.');
        }

        if (this.isRequiredUsualButNotContains()) {
            this.reject('You have no working usual judges.');
        }
    }

    /** @returns {boolean} True if HTTPS protocol is targeted but no SSL judges responded */
    isRequiredSSLButNotContains() {
        return this.targetProtocols.includes('https') && this.list.ssl.length == 0;
    }

    /** @returns {boolean} True if HTTP protocol is targeted but no usual judges responded */
    isRequiredUsualButNotContains() {
        return this.targetProtocols.some(protocol => ['http'].includes(protocol)) && this.list.usual.length == 0;
    }
}
