---
description: Rules for writing safe, multi-version SQLite migrations using PRAGMA user_version
globs: backend/internal/store/store.go
alwaysApply: false
---

# SQLite Migration Rules

Migrations live in `backend/internal/store/store.go` as the `migrations` slice. The runner applies them in order using `PRAGMA user_version` — one transaction per migration. A user can be any number of versions behind; every pending migration runs in sequence on startup. A crash mid-migration rolls back atomically (the transaction reverts, `user_version` stays at the previous value), so the migration simply retries on the next launch.

## The golden rules

- **NEVER modify a shipped migration** — only append new ones. Once a version has been released, that migration has already run on real databases. Changing it has no effect on those users. Un-shipped (in-development) migrations may be freely modified before a release goes out.
- **NEVER assume a specific starting state** — a user upgrading from v0 runs every migration in order; a user on v3 skips the first three. Each migration must be self-contained.
- **Always provide a `down` function when the change is reversible** — primarily for documentation and manual recovery, not routine rollback. Set to `nil` with a comment when reversal is genuinely impossible (e.g. lossy data transforms). Don't stress about it for desktop app deployments — no one is rolling back their local SQLite database.

## What belongs in a migration

Schema changes (DDL) and bounded data backfills are both fine inside a migration transaction. The concern is not "whether" but "how long the write lock is held."

| Change | Approach |
|---|---|
| `ALTER TABLE ADD COLUMN` | Fine — instant in SQLite regardless of table size |
| `CREATE INDEX` | Fine — one-time cost, acceptable on startup |
| `ALTER TABLE RENAME COLUMN` | Fine — supported since SQLite 3.25 (our driver bundles 3.49.1) |
| `ALTER TABLE DROP COLUMN` | Fine — supported since SQLite 3.35 |
| Small backfill (< ~50K rows, completes in < 1s) | Fine inside the transaction |
| Large backfill (> ~50K rows or unbounded) | Use the batched loop pattern below |

## Large backfill pattern

**Important:** `mattn/go-sqlite3` does NOT compile with `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`. `UPDATE ... LIMIT` fails with a syntax error at runtime. Use `UPDATE ... FROM (SELECT ...)` instead — available since SQLite 3.33 (our driver bundles 3.49.1) and more efficient than an `IN` subquery.

```go
// ✅ Schema change inside the migration transaction — instant
up: func(tx *sql.Tx) error {
    if _, err := tx.Exec(`ALTER TABLE check_results ADD COLUMN foo TEXT NOT NULL DEFAULT ''`); err != nil {
        return err
    }
    // Backfill in batches outside the migration transaction to avoid
    // holding the write lock for an unbounded duration.
    return nil
},
```

Then after `initDB` returns (in `Open`), run the batched backfill in its own transactions:

```go
// ✅ Batched backfill — each iteration is a short, independent transaction
func backfillFoo(db *sql.DB) error {
    for {
        // UPDATE...FROM is SQLite 3.33+ and avoids IN-subquery materialisation.
        res, err := db.Exec(`
            UPDATE check_results
            SET foo = 'bar'
            FROM (SELECT id FROM check_results WHERE foo = '' LIMIT 10000) AS sub
            WHERE check_results.id = sub.id`)
        if err != nil {
            return err
        }
        n, _ := res.RowsAffected()
        if n == 0 {
            return nil
        }
    }
}
```

If the backfill is driven by a background worker (like geo enrichment), document that in the migration comment so it's clear the backfill is intentionally deferred.

## Index migrations

Create indexes as part of the migration that introduces the column they index — not as a separate migration. The write lock held during index creation is a one-time startup cost and acceptable.

```go
{
    // v2: add foo column and index it immediately.
    up: func(tx *sql.Tx) error {
        if _, err := tx.Exec(`ALTER TABLE check_results ADD COLUMN foo TEXT NOT NULL DEFAULT ''`); err != nil {
            return err
        }
        _, err := tx.Exec(`CREATE INDEX IF NOT EXISTS idx_check_results_foo ON check_results (foo)`)
        return err
    },
    down: func(tx *sql.Tx) error {
        if _, err := tx.Exec(`DROP INDEX IF EXISTS idx_check_results_foo`); err != nil {
            return err
        }
        _, err := tx.Exec(`ALTER TABLE check_results DROP COLUMN foo`)
        return err
    },
},
```

## Checklist before adding a migration

- [ ] Appended to the end of `migrations` — not inserted or modified (unless un-shipped)
- [ ] `up` is idempotent where possible (`IF NOT EXISTS`, `IF EXISTS`)
- [ ] No `UPDATE ... LIMIT` — use `UPDATE ... FROM (SELECT ... LIMIT N) AS sub WHERE t.id = sub.id`
- [ ] Large backfills are batched outside the migration transaction
- [ ] `down` is provided or explicitly `nil` with a reason
- [ ] Migration comment explains the why, not just the what
- [ ] `go build ./...` passes after the change
