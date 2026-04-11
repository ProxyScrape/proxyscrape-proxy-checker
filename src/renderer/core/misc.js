/**
 * Splits an array into consecutive chunks of a given size.
 * The last chunk may contain fewer elements.
 * @template T
 * @param {T[]} array - Source array
 * @param {number} size - Maximum elements per chunk
 * @returns {T[][]}
 */
export const arrayToChunks = (array, size) => {
    const res = [];

    for (let i = 0; i < array.length; i += size) {
        const chunk = array.slice(i, i + size);
        res.push(chunk);
    }

    return res;
};
