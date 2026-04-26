---
description: Keep .claude/rules/ and .cursor/rules/ in lockstep — same content, mirrored filenames
alwaysApply: true
---

# Keep Claude rules in sync with Cursor rules

`.claude/rules/` and `.cursor/rules/` are **mirrors of each other**. Every rule (other than this sync rule and its Cursor counterpart) must exist in both places with identical content.

## File mapping

| `.claude/rules/` | `.cursor/rules/` |
|---|---|
| `<name>.md` | `<name>.mdc` |

The `.mdc` extension is Cursor's convention; `.md` is Claude's. Frontmatter (`description`, `globs`, `alwaysApply`) is preserved verbatim across both — Cursor reads it; Claude tolerates it.

## When you change a rule

Whenever you add, edit, rename, or delete a file in **either** directory, make the matching change in the **other** directory in the same commit. No exceptions:

- Edit `.claude/rules/sqlite-migrations.md` → also edit `.cursor/rules/sqlite-migrations.mdc`.
- Add `.cursor/rules/new-thing.mdc` → also add `.claude/rules/new-thing.md`.
- Delete on one side → delete on the other.
- Rename on one side → rename on the other (preserve the basename, only the extension differs).

If asked to update "the rules" without specifying a tool, update both.

## Drift check

Before committing changes that touch either directory, verify the two trees match (basenames identical, content identical modulo the `.md`/`.mdc` extension):

```bash
diff <(ls .claude/rules | sed 's/\.md$//' | sort) \
     <(ls .cursor/rules | grep -v '^sync-with-claude' | sed 's/\.mdc$//' | sort)
```

The only filename that legitimately differs between the two trees is this sync rule itself: `.claude/rules/sync-with-cursor.md` vs `.cursor/rules/sync-with-claude.mdc` — they are each tool's instruction to mirror the other and intentionally do not have a counterpart with the same basename.
