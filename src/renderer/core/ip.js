import axios from 'axios';
import { DEFAULT_IP_SETTINGS } from '../constants/SettingsConstants';

export const getIP = async (url) => {
    try {
        const { lookupUrl } = DEFAULT_IP_SETTINGS;

        const response = await axios.get(url ? url : lookupUrl, { timeout: 10000, responseType: 'text' });
        return response.data;
    } catch {
        throw new Error('IP lookup failed. Try again later.');
    }
};
