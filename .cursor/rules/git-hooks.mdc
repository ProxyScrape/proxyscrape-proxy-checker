---
description: Git hooks location and authoring rules for proxyscrape-proxy-checker
globs: .githooks/**
alwaysApply: true
---

# Git Hooks

All active git hooks live in `.githooks/` — never `.git/hooks/`.

`core.hooksPath` is set to `.githooks` (configured by `npm install` via the `prepare` script). This means `.git/hooks/` is **completely ignored by git** — any hook written there will silently never run.

## Rules

- **Always edit `.githooks/`** — never create or edit files in `.git/hooks/`
- **New hook types** (e.g. `commit-msg`, `post-merge`) go in `.githooks/`, not `.git/hooks/`
- **Always make hook files executable**: `chmod +x .githooks/<hookname>`
- **One file per hook type** — merge all checks for a given hook into a single file

## Current hooks

| File | When it runs | What it checks |
|---|---|---|
| `.githooks/pre-commit` | Every commit | Bare `target="_blank"` in renderer source; version discipline on master |
| `.githooks/pre-push` | Every push | Guest route coverage, SQL injection (gosec), unsafe PRAGMA, dead code (staticcheck U1000) |

## Adding a new check

Add it inside the relevant existing hook file in the appropriate section — do not create a new file or write to `.git/hooks/`.
