#!/usr/bin/env node
// Verifies that every SHA512 and size in release/*.yml matches the
// corresponding file on disk, and that every non-portable NSIS installer has a
// valid .blockmap file (exists, non-empty, gzip magic bytes).
// Run after generate-win-blockmaps.cjs and before R2 upload.
'use strict';

const yaml   = require('js-yaml');
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

        // Validate blockmap for non-portable NSIS installers.
        if (file.url.includes('-portable')) continue;
        const blockmapPath = path.join(releaseDir, file.url + '.blockmap');
        if (!fs.existsSync(blockmapPath)) {
            console.error(`BLOCKMAP MISSING  ${file.url}.blockmap`);
            failures++;
            continue;
        }
        const bmBuf = fs.readFileSync(blockmapPath);
        if (bmBuf.length === 0) {
            console.error(`BLOCKMAP EMPTY  ${file.url}.blockmap`);
            failures++;
            continue;
        }
        // gzip magic: first two bytes must be 0x1f 0x8b
        if (bmBuf[0] !== 0x1f || bmBuf[1] !== 0x8b) {
            console.error(`BLOCKMAP NOT GZIP  ${file.url}.blockmap  (magic: ${bmBuf[0].toString(16)} ${bmBuf[1].toString(16)})`);
            failures++;
            continue;
        }
        const bmSizeOk = typeof file.blockMapSize === 'number' && file.blockMapSize === bmBuf.length;
        if (!bmSizeOk) {
            console.error(`BLOCKMAP SIZE MISMATCH  ${file.url}.blockmap`);
            console.error(`  yml:  ${file.blockMapSize}`);
            console.error(`  disk: ${bmBuf.length}`);
            failures++;
            continue;
        }
        console.log(`BLOCKMAP OK  ${file.url}.blockmap  (${bmBuf.length} bytes)`);
    }
}

if (failures > 0) {
    console.error(`\n${failures} checksum error(s) — aborting before R2 upload.`);
    process.exit(1);
}
console.log('\nAll checksums verified.');
