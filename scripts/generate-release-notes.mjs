#!/usr/bin/env node
/**
 * Generates AI release notes for a new version and prepends them to releases.json.
 *
 * CI usage:
 *   # 1. Download current releases.json from R2 first (or create an empty one)
 *   # 2. Run this script:
 *   node scripts/generate-release-notes.mjs --tag=v2.0.17-canary \
 *     --input=releases.json --output=releases.json
 *   # 3. Upload the updated releases.json back to R2
 *
 * Required environment variables:
 *   OPENROUTER_API_KEY  – OpenRouter API key for AI note generation
 *
 * Human escape hatch:
 *   If the current version already has an entry in releases.json (e.g. you manually
 *   prepended it before triggering CI), the script exits 0 without calling the AI.
 *   This lets you override AI-generated notes for any release.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const eq = a.indexOf('=');
      return eq === -1 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)];
    })
);

const tag = args.tag;
const inputFile = args.input || 'releases.json';
const outputFile = args.output || 'releases.json';

if (!tag) {
  process.stderr.write('Error: --tag is required (e.g. --tag=v2.0.17-canary)\n');
  process.exit(1);
}

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  process.stderr.write('Error: OPENROUTER_API_KEY environment variable is required\n');
  process.exit(1);
}

// ── Derive version/channel ────────────────────────────────────────────────────

const version = tag.replace(/^v/, '');
const isPrerelease = /-(canary|beta|alpha)/.test(version);
const channel = isPrerelease ? 'canary' : 'stable';

// ── Load existing releases.json ───────────────────────────────────────────────

let releases = [];
if (fs.existsSync(inputFile)) {
  try {
    releases = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  } catch {
    process.stderr.write(`Warning: could not parse ${inputFile} — starting fresh\n`);
    releases = [];
  }
}

// Human escape hatch — if entry already exists, skip AI generation entirely.
if (releases.some(r => r.version === version)) {
  process.stderr.write(
    `Entry for ${version} already exists in releases.json — ` +
    `skipping AI generation (human-authored notes preserved)\n`
  );
  // Still write output so CI can safely read from it even if input === output.
  fs.writeFileSync(outputFile, JSON.stringify(releases, null, 2) + '\n', 'utf-8');
  process.exit(0);
}

// ── Find previous same-channel tag ───────────────────────────────────────────

function getPreviousTag(currentTag, channel) {
  try {
    const allTags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' })
      .split('\n')
      .map(t => t.trim())
      .filter(Boolean);

    const channelTags = channel === 'canary'
      ? allTags.filter(t => /-(canary|beta|alpha)/.test(t))
      : allTags.filter(t => /^v\d+\.\d+\.\d+$/.test(t));

    const idx = channelTags.indexOf(currentTag);
    if (idx === -1 || idx === channelTags.length - 1) return null;
    return channelTags[idx + 1];
  } catch (err) {
    process.stderr.write(`Warning: could not determine previous tag: ${err.message}\n`);
    return null;
  }
}

const prevTag = getPreviousTag(tag, channel);
process.stderr.write(`Generating notes for ${tag} (channel: ${channel}, prev: ${prevTag ?? 'none'})\n`);

// ── Get commit messages between tags ──────────────────────────────────────────

function getCommits(from, to) {
  try {
    const range = from ? `${from}..${to}` : to;
    // %s = subject (first line), %b = body (additional lines).
    // The separator lets us clearly delineate commits in the AI prompt.
    const raw = execSync(
      `git log ${range} --format="- %s%n%b" --no-merges`,
      { encoding: 'utf-8' }
    ).trim();
    if (!raw) return null;
    // Collapse excessive blank lines produced by commits with no body.
    return raw.replace(/\n{3,}/g, '\n\n').trim();
  } catch (err) {
    process.stderr.write(`Warning: could not retrieve git log: ${err.message}\n`);
    return null;
  }
}

const commits = getCommits(prevTag, tag);

// ── Build prompt ──────────────────────────────────────────────────────────────

function buildPrompt(version, prevVersion, channel, commits) {
  const app =
    'ProxyScrape Proxy Checker — a cross-platform desktop proxy-checking app ' +
    '(Electron + React frontend, Go backend).';

  if (!commits) {
    return (
      `You are writing release notes for ${app}\n\n` +
      `This is release ${version}. No commit history is available.\n` +
      `Write a brief one-line "Release ${version}" note.\n` +
      `Output only the markdown, nothing else.`
    );
  }

  if (channel === 'stable') {
    return (
      `You are writing release notes for ${app}\n\n` +
      `These are all git commits since the last stable release ` +
      `(${prevVersion ?? 'initial'}), included in stable release ${version}:\n\n` +
      `${commits}\n\n` +
      `Write a "What's New in ${version}" summary for users upgrading from the ` +
      `previous stable release. Focus on the big picture — major capabilities, ` +
      `important fixes, meaningful improvements. Skip internal/CI-only changes.\n` +
      `Use Keep a Changelog sections as appropriate: ### Added, ### Changed, ` +
      `### Fixed, ### Security\n` +
      `One concise sentence per bullet. Output only the markdown, nothing else.`
    );
  }

  return (
    `You are writing release notes for ${app}\n\n` +
    `These are the git commits between ${prevVersion} and ${version}:\n\n` +
    `${commits}\n\n` +
    `Write concise, user-facing release notes in Keep a Changelog format. ` +
    `Focus on what end users would notice — new features, bug fixes, ` +
    `behaviour changes. Skip internal/CI-only changes.\n` +
    `Use Keep a Changelog sections as appropriate: ### Added, ### Changed, ` +
    `### Fixed, ### Security\n` +
    `One concise sentence per bullet. Output only the markdown, nothing else.`
  );
}

const prompt = buildPrompt(version, prevTag, channel, commits);

// ── Call OpenRouter ───────────────────────────────────────────────────────────

async function generateNotes(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://proxyscrape.com',
      'X-Title': 'ProxyScrape Proxy Checker CI',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

let notes;
try {
  notes = await generateNotes(prompt);
  process.stderr.write(`AI-generated notes:\n${notes}\n`);
} catch (err) {
  process.stderr.write(`Warning: AI generation failed — using fallback: ${err.message}\n`);
  notes = '_Release notes pending._';
}

// ── Build and write the updated releases.json ─────────────────────────────────

const today = new Date().toISOString().split('T')[0];

const newEntry = {
  version,
  date: today,
  channel,
  notes,
};

const updated = [newEntry, ...releases];
fs.writeFileSync(outputFile, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
process.stderr.write(`Written ${updated.length} entries to ${outputFile}\n`);
