---
description: Do not blindly adjust code just to make dead-code or lint checks pass
alwaysApply: true
---

# Dead Code Check Integrity

When a static analysis tool (knip, staticcheck, ESLint, etc.) flags something as unused or dead:

## Required before making any change

1. **Understand why** — Determine whether the code is:
   - Genuinely unused (forgotten, superseded, or never wired up)
   - A false positive (alias, dynamic import, reflection, CGO, etc.)
   - Intentionally exported for external consumers not visible to the tool

2. **Explain the cause** — Before touching the code, state clearly:
   - What the flagged symbol does
   - Why it appears unused (e.g. "only used internally", "was never called", "replaced by inline logic")
   - Whether removing/un-exporting it is safe
   - Check the git history on what happened, was something intentionally removed and the code became dead because something replaced it? Etc.

## Hard rules

- ❌ **Never** remove `export`, delete code, or add suppressions just to make the check pass without understanding the reason
- ❌ **Never** add a blanket `ignore` / `ignoreDependencies` / `//lint:ignore` entry to silence a finding without a written explanation
- ✅ If the finding is a **genuine false positive**, document the reason inline or in `knip.json`/the lint config
- ✅ If you **cannot determine** whether a change is safe, **stop and ask the user** before proceeding

## Example

```
// ❌ BAD — silencing without understanding
//lint:ignore U1000 ignore

// ✅ GOOD — explicit reason
//lint:ignore U1000 CGO export; called by C code at runtime, not visible to Go analysis
```
