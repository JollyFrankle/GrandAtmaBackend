'use strict';

import { networkInterfaces } from "os";

const nets = networkInterfaces();
const results: {[key: string]: string[]} = {}; // Or just '{}', an empty object

for (const name of Object.keys(nets)) {
    const netsByName = nets[name];
    if (netsByName) {
        for (const net of netsByName) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                if (!results[name]) {
                    results[name] = [];
                }
                results[name].push(net.address);
            }
        }
    }
}

export default function getIP() {
    const keys = Object.keys(results);
    if (keys.length > 0) {
        return results[keys[0]][0];
    }
    return null;
}

export { results }