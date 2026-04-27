/**
 * Parse Worker — runs findMixedProxies + uniq off the main thread.
 *
 * Receives: { id, buffer }
 *   id     — request identifier for stale-result rejection
 *   buffer — ArrayBuffer of UTF-8 encoded proxy text (transferred, not cloned)
 *
 * Posts back: { id, fullList, uniqueLines, errors, unique, hasProtocols, totalLines, byteLength }
 *   fullList     — all successfully parsed proxy objects (including duplicates)
 *   uniqueLines  — deduplicated source line strings (used to update the editor on Remove)
 *   errors       — { line, reason }[] for lines that failed parsing (unique lines only)
 *   unique       — count of unique non-empty lines (before parsing)
 *   hasProtocols — whether any line has an explicit scheme prefix
 *   totalLines   — count of non-empty lines (before dedup)
 *   byteLength   — byte size of the received buffer
 */

import findMixedProxies, { extractScheme } from '../misc/FindMixedProxies.js';
import { uniq } from '../misc/array.js';

self.onmessage = ({ data }) => {
    const { id, buffer } = data;

    const byteLength    = buffer.byteLength;
    const text          = new TextDecoder().decode(buffer);
    const allLines      = text.split(/\r?\n/).filter(Boolean);
    const uniqueLines   = uniq(allLines);

    // Parse unique lines only — avoids redundant work for large duplicate lists.
    const { successed: uniqueList, failed: errors } = findMixedProxies(uniqueLines);
    const hasProtocols = uniqueLines.some(line => extractScheme(line) !== '');

    // Build a map from each unique line string to its parsed proxy object so we
    // can reconstruct the full list (including duplicates) in O(n) without
    // re-running the parser on every line.
    const failedSet = new Set(errors.map(e => e.line));
    const parsedMap = new Map();
    let si = 0;
    for (const line of uniqueLines) {
        if (failedSet.has(line)) {
            parsedMap.set(line, null);
        } else {
            parsedMap.set(line, uniqueList[si++]);
        }
    }

    const fullList = [];
    for (const line of allLines) {
        const proxy = parsedMap.get(line);
        if (proxy != null) fullList.push(proxy);
    }

    self.postMessage({
        id,
        fullList,
        uniqueLines,
        errors,
        unique:      uniqueLines.length,
        hasProtocols,
        totalLines:  allLines.length,
        byteLength,
    });
};
