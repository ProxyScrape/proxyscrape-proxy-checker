#!/usr/bin/env node
// Verifies that every SHA512 and size in release/*.yml matches the
// corresponding file on disk. Run after update-win-checksums.cjs and before
// R2 upload so a bug in the regeneration step fails the job, not users.
'use strict';

const yaml   = require('./node_modules/js-yaml');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const releaseDir = path.resolve('release');
const ymlFiles   = fs.readdirSync(releaseDir).filter(f => f.endsWith('.yml'));
let failures = 0;

for (const ymlFile of ymlFiles) {
    const ymlPath = path.join(releaseDir, ymlFile);
    let doc;
    try {
        doc = yaml.load(fs.readFileSync(ymlPath, 'utf8'));
    } catch {
        continue;
    }
    if (!doc || !doc.files) continue;

    for (const file of doc.files) {
        const exePath = path.join(releaseDir, file.url);
        if (!fs.existsSync(exePath)) {
            console.error(`MISSING  ${file.url}`);
            failures++;
            continue;
        }
        const buf         = fs.readFileSync(exePath);
        const actualHash  = crypto.createHash('sha512').update(buf).digest('base64');
        const actualSize  = buf.length;
        const hashOk      = actualHash === file.sha512;
        const sizeOk      = actualSize === file.size;

        if (hashOk && sizeOk) {
            console.log(`OK       ${file.url}  (${actualSize} bytes)`);
        } else {
            if (!hashOk) {
                console.error(`SHA512 MISMATCH  ${file.url}`);
                console.error(`  yml:  ${file.sha512}`);
                console.error(`  disk: ${actualHash}`);
            }
            if (!sizeOk) {
                console.error(`SIZE MISMATCH  ${file.url}`);
                console.error(`  yml:  ${file.size}`);
                console.error(`  disk: ${actualSize}`);
            }
            failures++;
        }
    }
}

if (failures > 0) {
    console.error(`\n${failures} checksum error(s) — aborting before R2 upload.`);
    process.exit(1);
}
console.log('\nAll checksums verified.');
