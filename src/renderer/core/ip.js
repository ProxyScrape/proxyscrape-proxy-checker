import axios from 'axios';
import { DEFAULT_IP_SETTINGS } from '../constants/SettingsConstants';

/**
 * Resolves the user's public IP address by querying a lookup service.
 * Falls back to the default lookup URL from settings if none is provided.
 * @param {string} [url] - Custom IP lookup URL (overrides the default)
 * @returns {Promise<string>} The user's public IP as plain text
 * @throws {Error} If the lookup request fails or times out (10 s)
 */
export const getIP = async (url) => {
    try {
        const { lookupUrl } = DEFAULT_IP_SETTINGS;

        const response = await axios.get(url ? url : lookupUrl, { timeout: 10000, responseType: 'text' });
        return response.data;
    } catch {
        throw new Error('IP lookup failed. Try again later.');
    }
};
