#!/usr/bin/env node
// Regenerates .blockmap files for every Windows installer in release/ after
// code-signing. electron-builder generates blockmaps from the unsigned .exe;
// signing changes the bytes, making those blockmaps describe the wrong content.
// Running this after signing produces blockmaps that match the signed installer,
// enabling differential downloads in electron-updater.
//
// Also updates the blockMapSize field in each release/*.yml so electron-updater
// can verify the download. Must run after update-win-checksums.cjs.
'use strict';

const { spawnSync } = require('child_process');
const { appBuilderPath } = require('app-builder-bin');
const yaml   = require('js-yaml');
const fs     = require('fs');
const path   = require('path');

if (!fs.existsSync(appBuilderPath)) {
    console.error(`app-builder binary not found at: ${appBuilderPath}`);
    process.exit(1);
}

const releaseDir = path.resolve('release');
const ymlFiles   = fs.readdirSync(releaseDir).filter(f => f.endsWith('.yml'));

if (ymlFiles.length === 0) {
    console.error('No .yml files found in release/ — nothing to do.');
    process.exit(1);
}

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

    let ymlDirty = false;

    for (const file of doc.files) {
        // Portable executables share the same .exe extension but use a different
        // update mechanism — they have no blockMapSize field and do not need one.
        if (file.url.includes('-portable')) continue;

        const exePath      = path.join(releaseDir, file.url);
        const blockmapPath = exePath + '.blockmap';

        if (!fs.existsSync(exePath)) {
            console.error(`MISSING  ${file.url}`);
            failures++;
            continue;
        }

        const result = spawnSync(
            appBuilderPath,
            ['blockmap', `--input=${exePath}`, `--output=${blockmapPath}`, '--compression=gzip'],
            { encoding: 'utf8' }
        );

        if (result.status !== 0) {
            console.error(`FAILED   ${file.url}`);
            console.error(result.stderr || result.error?.message || '(no error output)');
            failures++;
            continue;
        }

        const blockMapSize = fs.statSync(blockmapPath).size;
        file.blockMapSize  = blockMapSize;
        ymlDirty           = true;
        console.log(`OK       ${file.url}  blockmap=${blockMapSize} bytes`);
    }

    if (ymlDirty) {
        fs.writeFileSync(ymlPath, yaml.dump(doc, { lineWidth: -1 }));
        console.log(`Updated blockMapSize in ${ymlFile}`);
    }
}

if (failures > 0) {
    console.error(`\n${failures} blockmap error(s) — aborting before R2 upload.`);
    process.exit(1);
}
console.log('\nAll blockmaps generated.');
