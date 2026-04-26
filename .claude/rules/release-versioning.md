---
description: Release versioning rules for proxyscrape-proxy-checker — tag discipline, version bumping, and channel conventions
alwaysApply: true
---

# Release Versioning

## Version scheme: `2.X.Y`

| Part | Meaning |
|------|---------|
| `2` | Major — fixed for this generation |
| `X` | Feature cycle — shared between canary and the stable it graduates to |
| `Y` | Iteration — increments freely in canary, always `0` in stable |

### The full cycle

```
2.1.1-canary → 2.1.2-canary → 2.1.3-canary   (Y increments in canary)
        ↓
     2.1.0                                      (promote to stable: same X, Y resets to 0)
        ↓
2.2.1-canary → 2.2.2-canary → ...              (new canary cycle: X bumps, Y starts at 1)
        ↓
     2.2.0                                      (next stable)
```

**X is the same in canary and the stable it produces.**
X only bumps when starting the *next* canary cycle after a stable promotion.

## Cutting a canary release

`package.json` **must be updated and committed before `git tag`**. The CI version gate compares `package.json` against the tag and blocks all builds if they differ.

```bash
npm version 2.X.Y-canary --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: bump version to 2.X.Y-canary"
git tag v2.X.Y-canary
git push origin canary && git push origin v2.X.Y-canary
```

If you forget to bump `package.json` and push the tag anyway, **do not delete the tag**. Cut a new Y instead (see "Tags are immutable" below).

## Promoting canary to stable

The stable version uses the **same X** as the canary cycle, with **Y = 0**:

```bash
# Last canary was 2.1.7-canary → stable is 2.1.0

# 1. Merge canary into master
git checkout master && git merge canary --no-edit

# 2. Set version to 2.X.0 (same X as canary, Y reset to 0)
npm version 2.X.0 --no-git-tag-version

# 3. Commit, tag, push master
git add package.json package-lock.json
git commit -m "chore: promote v2.X.0 to stable"
git push origin master && git tag v2.X.0 && git push origin v2.X.0

# 4. Merge master back into canary to keep branches in sync
git checkout canary && git merge master --no-edit && git push origin canary
```

## Starting the next canary cycle (after a stable promotion)

X bumps by 1, Y starts at 1:

```bash
# Last stable was 2.1.0 → next canary cycle is 2.2.x
npm version 2.2.1-canary --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: start 2.2.x-canary cycle"
git push origin canary
```

## IMPORTANT: Switching back to canary after a stable promotion

Whenever the user asks to "switch to canary" or "go back to canary" or checks out the `canary` branch, **always check first**:

1. Run `git log --oneline origin/master..origin/canary` — if the output is **empty**, canary and master are in sync, meaning a stable was just promoted.
2. Check `package.json` version on canary — if it still ends in `-canary` with the **same X as the last stable tag**, the cycle bump has not been done yet.
3. If both are true: **immediately bump canary to `2.(X+1).1-canary`** before doing anything else:

```bash
npm version 2.(X+1).1-canary --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: start 2.(X+1).x-canary cycle"
git push origin canary
```

**Never leave canary at the same X as a released stable.** The bump must happen as part of switching back to canary — not later.

## Tags are immutable — never delete and recreate

Once a tag is pushed, never delete or recreate it — even if CI failed. Increment Y and push a new tag instead:

```
v2.1.1-canary  →  v2.1.2-canary   ✅  (CI failed on .1? just cut .2)
git tag -d v2.1.1-canary           ❌  never do this
```

Deleting a pushed tag rewrites history that other systems (GitHub Actions runs, R2 artifacts, Dependabot) may have already observed. A failed CI run produces no user-facing release, so there is no reason to recycle the tag — the Y increment costs nothing.

## Sources of truth — only `package.json` needs manual edits

| Source | How it's set |
|--------|-------------|
| `package.json` `version` | **Manual** — only thing to change |
| Go `appVersion` | Auto-injected via `-ldflags` at build time |
| `IS_CANARY` flag | Auto-derived from version containing `-canary` |
| `appId` / `productName` | Auto-derived in `electron-builder.config.js` |
| R2 channel path | Auto-derived from tag name in CI workflow |

The pre-push hook and CI `check-versions` job enforce that the tag matches `package.json`.
