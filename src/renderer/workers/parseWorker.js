/**
 * Parse Worker — runs findMixedProxies + uniq off the main thread.
 *
 * Receives: { id, lines }
 *   id    — request identifier for stale-result rejection on the main thread
 *   lines — string[], pre-split and pre-filtered (no empty strings)
 *
 * Posts back: { id, list, errors, unique, hasProtocols }
 *   list         — successfully parsed proxy objects
 *   errors       — { line, reason }[] for lines that failed parsing
 *   unique       — count of unique lines after dedup
 *   hasProtocols — whether any line in the list has an explicit scheme prefix
 */

import findMixedProxies, { extractScheme } from '../misc/FindMixedProxies.js';
import { uniq } from '../misc/array.js';

self.onmessage = ({ data }) => {
    const { id, lines } = data;

    const uniqueLines = uniq(lines);
    const { successed: list, failed: errors } = findMixedProxies(uniqueLines);

    const hasProtocols = uniqueLines.some(line => extractScheme(line) !== '');

    self.postMessage({ id, list, errors, unique: uniqueLines.length, hasProtocols });
};
