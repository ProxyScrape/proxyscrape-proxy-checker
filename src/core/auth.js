import rp from 'request-promise';

import { CHECK_AUTH } from '../constants/APIConstants';

const ip_url = "https://geolocation-db.com/json/";

export const auth = async () => {
    try {
        
        const res = await rp.get(ip_url);

        const current_ip = res.data.IPv4;

        CHECK_AUTH.json.user_ip = current_ip;

        const result = await rp.post(CHECK_AUTH);
      
        console.log(result);
        
    } catch {
        return false;
    }
}
