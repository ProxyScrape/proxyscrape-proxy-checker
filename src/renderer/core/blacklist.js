import axios from 'axios';
import { uniq } from '../misc/array';
import { readFile } from 'fs/promises';
import { isURL, findIPs, findIPsWithRanges } from '../misc/regexes';
import { cidrSubnet } from 'ip';

/**
 * @typedef {Object} BlacklistItem
 * @property {string} title - Display name of the blacklist
 * @property {string} path - URL or local file path to the blacklist source
 */

/**
 * Loads and queries IP blacklists.
 *
 * Each blacklist source (URL or local file) is fetched in parallel during
 * construction. IP addresses and CIDR ranges are extracted from each source.
 * The constructor returns a Promise that resolves with the Blacklist instance
 * once all sources have been loaded.
 *
 * After construction, {@link check} can be called for each proxy IP to determine
 * which blacklists (if any) contain it.
 */
export default class Blacklist {
    /**
     * Fetches all blacklist sources and resolves when ready.
     * @param {BlacklistItem[]} items - Blacklist sources to load
     * @returns {Promise<Blacklist>} Resolves with this instance once all sources are loaded
     */
    constructor(items) {
        this.data = [];
        this.counter = {
            all: items.length,
            done: 0
        };

        this.inListsCounter = {};

        return new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
            this.launch(items);
        }).catch(error => alert(error));
    }

    /**
     * Checks whether an IP appears in any loaded blacklist.
     * Supports both exact IP matches and CIDR range containment.
     * @param {string} ip - The IP address to check
     * @returns {string[]|false} Array of blacklist titles that contain the IP, or false
     */
    check(ip) {
        let inLists = [];
        
        const inMultipleRanges = (ip, arrayOfRanges) => {
            return arrayOfRanges.some(range => {
                if (range.indexOf('/') != -1) {
                    return cidrSubnet(range).contains(ip);
                }

                return ip == range;
            });
        };

        this.data.forEach(list => {
            if (inMultipleRanges(ip, list.addresses)) {
                inLists.push(list.title);
            }
        });

        const res = inLists.length > 0 ? inLists : false;

        if (res) {
            this.setInListsCounter(inLists);
        }

        return res;
    }

    /**
     * Increments per-blacklist hit counters for results display.
     * @param {string[]} inLists - Blacklist titles the IP was found in
     */
    setInListsCounter(inLists) {
        inLists.forEach(item => {
            this.inListsCounter[item] = (this.inListsCounter[item] || 0) + 1;
        });
    }

    /**
     * Returns per-blacklist hit counts for display in the results view.
     * @returns {{ active: boolean, title: string, count: number }[]}
     */
    getInListsCounter() {
        const res = [];

        Object.keys(this.inListsCounter).forEach(item => {
            res.push({
                active: true,
                title: item,
                count: this.inListsCounter[item]
            });
        });

        return res;
    }

    /**
     * Extracts unique IP addresses and CIDR ranges from raw blacklist content.
     * @param {string} content - Raw text content of a blacklist source
     * @returns {string[]} De-duplicated array of IPs and CIDR ranges
     */
    getIPs(content) {
        const ips = findIPs(content);
        const ipsWithRanges = findIPsWithRanges(content);
        const result = ips && ipsWithRanges ? [...ips, ...ipsWithRanges] : ips ? ips : ipsWithRanges;

        return uniq(result);
    }

    /**
     * Fetches a single blacklist source (URL via HTTP or local file).
     * On success stores parsed IPs; on failure silently skips the source.
     * @param {BlacklistItem} item
     */
    async load(item) {
        try {
            let content;
            if (isURL(item.path)) {
                const response = await axios.get(item.path, { responseType: 'text' });
                content = response.data;
            } else {
                content = await readFile(item.path, 'utf8');
            }
            this.onSuccess(item, content);
        } catch {
            this.isDone();
        }
    }

    /**
     * Starts loading all blacklist sources in parallel.
     * @param {BlacklistItem[]} items
     */
    launch(items) {
        items.forEach(item => this.load(item));
    }

    /**
     * Tracks source completion. Resolves the constructor promise when all
     * sources have been loaded (or failed).
     */
    isDone() {
        this.counter.done++;

        if (this.counter.done == this.counter.all) {
            this.resolve(this);
        }
    }

    /**
     * Stores parsed blacklist data and marks the source as done.
     * @param {BlacklistItem} item - The source metadata
     * @param {string} content - Raw text content fetched from the source
     */
    onSuccess(item, content) {
        this.data.push({
            title: item.title,
            addresses: this.getIPs(content)
        });

        this.isDone();
    }
}
