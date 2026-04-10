import axios from 'axios';
import { uniq } from '../misc/array';
import { readFile } from 'fs/promises';
import { isURL, findIPs, findIPsWithRanges } from '../misc/regexes';
import { cidrSubnet } from 'ip';

export default class Blacklist {
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

    setInListsCounter(inLists) {
        inLists.forEach(item => {
            this.inListsCounter[item] = (this.inListsCounter[item] || 0) + 1;
        });
    }

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

    getIPs(content) {
        const ips = findIPs(content);
        const ipsWithRanges = findIPsWithRanges(content);
        const result = ips && ipsWithRanges ? [...ips, ...ipsWithRanges] : ips ? ips : ipsWithRanges;

        return uniq(result);
    }

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

    launch(items) {
        items.forEach(item => this.load(item));
    }

    isDone() {
        this.counter.done++;

        if (this.counter.done == this.counter.all) {
            this.resolve(this);
        }
    }

    onSuccess(item, content) {
        this.data.push({
            title: item.title,
            addresses: this.getIPs(content)
        });

        this.isDone();
    }
}
