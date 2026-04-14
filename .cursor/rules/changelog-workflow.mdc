# Changelog Workflow

## Source of truth: R2 `releases.json`

Release notes live in `releases.json`, served from R2:

```
GET https://updates.proxyscrape.com/releases.json
```

There is **no** `CHANGELOG.md` or GitHub Release editor to maintain.
CI generates notes automatically from git commit messages using an AI (OpenRouter)
and prepends the new entry to the live `releases.json` on every tag push.

The in-app changelog (Info slideout) and update checks both read from this file.

## How CI generates notes (per-release)

1. The `publish` job checks out the full git history (`fetch-depth: 0`).
2. Downloads the current `releases.json` from R2.
3. Runs `scripts/generate-release-notes.mjs`:
   - Finds the previous same-channel tag via `git tag`.
   - Runs `git log <prev>..<current> --no-merges` to get commits.
   - Sends the commit messages to OpenRouter (`claude-haiku-4`) with a channel-aware
     prompt (canary → patch notes; stable → "What's New" summary).
   - Prepends the new entry (`{ version, date, channel, notes }`) to the array.
4. Uploads the updated `releases.json` to R2 (no-cache headers).
5. Extracts the new entry's `notes` field → uses as the GitHub Release body.

## Human override (escape hatch)

If you want to write notes yourself for a specific version:

1. Download `releases.json` from R2.
2. Prepend your entry manually:
   ```json
   {
     "version": "2.1.0-canary",
     "date": "2026-05-01",
     "channel": "canary",
     "notes": "### Added\n- My hand-written note"
   }
   ```
3. Upload it back to R2 **before** pushing the tag.

When CI runs, `generate-release-notes.mjs` detects the version already has an entry
and skips the AI call entirely, preserving your notes.

## Release workflow (step by step)

1. **Commit your changes** to the `canary` branch as usual — no changelog editing needed.

2. **Bump the version and tag**:
   ```bash
   npm version 2.1.0-canary --no-git-tag-version
   git add package.json
   git commit -m "chore: bump version to 2.1.0-canary"
   git tag v2.1.0-canary
   git push origin canary --tags
   ```

3. **CI picks up the tag** — automatically:
   - Builds binaries for all platforms and uploads to R2.
   - Generates AI release notes from commits since the last canary tag.
   - Prepends the new entry to `releases.json` and uploads to R2.
   - Creates a GitHub Release with the AI notes as the body.

4. **Stable graduation** — after merging `canary` into `main`:
   ```bash
   git checkout main
   git merge canary
   npm version 2.1.0 --no-git-tag-version
   git add package.json
   git commit -m "chore: stable release 2.1.0"
   git tag v2.1.0
   git push origin main --tags
   ```
   CI finds all commits since the last stable tag (the entire canary series) and asks
   the AI to write a high-level "What's New in 2.1.0" summary for stable users.
   Canary entries remain in `releases.json` with `channel: "canary"` — the app
   filters by channel so stable users only see stable entries.

## `releases.json` schema

```
GET https://updates.proxyscrape.com/releases.json
```

```json
[
  {
    "version": "2.1.0-canary",
    "date": "2026-05-01",
    "channel": "canary",
    "notes": "### Fixed\n- Some fix"
  },
  {
    "version": "2.0.0",
    "date": "2026-04-01",
    "channel": "stable",
    "notes": "### Added\n- First stable v2 release"
  }
]
```

- Sorted latest-first (newest entry at index 0).
- `channel` is `"canary"` for any version containing `-canary`, `-beta`, or `-alpha`; otherwise `"stable"`.
- The frontend and Go backend both filter by channel to show the right entries.

## Required CI secrets

| Secret | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | AI note generation via OpenRouter |
| `R2_BUCKET` | Cloudflare R2 bucket name |
| `R2_ENDPOINT` | R2 S3-compatible endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 API credentials |
| `R2_SECRET_ACCESS_KEY` | R2 API credentials |

## Do NOT

- ❌ Create or maintain a `CHANGELOG.md` — there isn't one anymore
- ❌ Write release notes in the GitHub Release editor (CI overwrites them on the next run)
- ❌ Use `--generate-notes` in CI (produces a raw git-log dump)
- ❌ Fetch the GitHub API at app runtime for changelog data (rate-limited and fragile)
- ❌ Filter or strip commit messages in the script — the AI prompt handles relevance
