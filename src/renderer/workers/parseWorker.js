/**
 * Parse Worker — runs findMixedProxies + uniq off the main thread.
 *
 * Receives: { id, buffer }
 *   id     — request identifier for stale-result rejection
 *   buffer — ArrayBuffer of UTF-8 encoded proxy text (transferred, not cloned)
 *
 * Posts back: { id, list, errors, unique, hasProtocols, totalLines, byteLength }
 *   list         — successfully parsed proxy objects
 *   errors       — { line, reason }[] for lines that failed parsing
 *   unique       — count of unique lines after dedup
 *   hasProtocols — whether any line has an explicit scheme prefix
 *   totalLines   — count of non-empty lines (before dedup)
 *   byteLength   — byte size of the received buffer
 */

import findMixedProxies, { extractScheme } from '../misc/FindMixedProxies.js';
import { uniq } from '../misc/array.js';

self.onmessage = ({ data }) => {
    const { id, buffer } = data;

    const byteLength = buffer.byteLength;
    const text       = new TextDecoder().decode(buffer);
    const allLines   = text.split(/\r?\n/).filter(Boolean);

    const uniqueLines = uniq(allLines);
    const { successed: list, failed: errors } = findMixedProxies(uniqueLines);
    const hasProtocols = uniqueLines.some(line => extractScheme(line) !== '');

    self.postMessage({
        id,
        list,
        errors,
        unique:      uniqueLines.length,
        hasProtocols,
        totalLines:  allLines.length,
        byteLength,
    });
};
