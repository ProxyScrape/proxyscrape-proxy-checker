---
description: Guest mode data must be strictly scoped to the session that created it and never shared or leaked between guests.
alwaysApply: true
---

# Guest Mode Data Isolation

## Core Principle

Guest sessions are ephemeral and untrusted. Data created by one guest must never be readable, modifiable, or discoverable by another guest — even if they know or guess a resource ID.

The backend runs in two modes: **guest** (`--mode=guest`, web deployment) and **default** (desktop/authenticated). Isolation logic only applies in guest mode. In default mode, all existing behaviour — full history, cross-session access, account data, admin endpoints — must continue to work exactly as before. Never add guest-mode restrictions that silently break the default mode.

## Backend Rules

- Every DB query that reads guest-owned data **must** filter by `session_id` in addition to the resource ID.
- Never expose a bare `GET /resource/{id}` endpoint in guest mode without verifying the session owns that resource.
- Ownership checks must happen **server-side** — never trust the client to scope its own requests.
- When a guest session expires or is pruned, **all associated data must be deleted** (results, checks, history). No orphaned rows.

## What Data May Be Stored for Guests

Only store what is strictly necessary for the feature to function:

- Check results for the current/recent session ✅
- Session-scoped settings (e.g. thread count, protocols) ✅
- Account data, cross-session history, or anything tied to identity ❌

## Avoid Duplicate Queries and Code Paths

Prefer a single query that conditionally applies the session scope over two separate queries for guest vs default mode:

```go
// ✅ GOOD — one query, optional WHERE clause
query := `SELECT ... FROM check_results WHERE check_id = ?`
args := []any{checkID}
if s.mode == "guest" {
    query += ` AND session_id = ?`
    args = append(args, sessionID)
}

// ❌ BAD — duplicated query logic
if s.mode == "guest" {
    rows, _ = db.Query(`SELECT ... WHERE check_id = ? AND session_id = ?`, checkID, sessionID)
} else {
    rows, _ = db.Query(`SELECT ... WHERE check_id = ?`, checkID)
}
```

If scoping logic is needed in more than one handler, extract it into a helper rather than repeating the `if s.mode == "guest"` check inline. The store layer is the right place for this — pass an optional `sessionID string` (empty in default mode) and let the store method handle the conditional:

```go
// store method signature — sessionID is "" in default mode
func (s *Store) GetCheck(ctx context.Context, id, sessionID string) (*Check, error)
```

## Mode-Aware Implementation Pattern

When a behaviour differs between modes, gate explicitly on `s.mode == "guest"` rather than making the restrictive path the default:

```go
// ✅ GOOD — restriction is opt-in for guest mode
if s.mode == "guest" {
    // scope query to session_id
}

// ❌ BAD — default mode accidentally inherits guest restriction
if s.mode != "default" {
    // ...
}
```

Always test that changes work in **both** modes before considering them done.

## New Endpoints & Queries Checklist

When adding any new endpoint or DB query that touches guest data, verify:

1. Is `session_id` scoped in the `WHERE` clause?
2. Does the handler return `401` (not `404`) for resources that exist but belong to a different session?
3. Is the data included in the session pruning/cleanup path?
4. Would a guest be able to enumerate other guests' resource IDs? If yes, add a further check.

## Returning 401 vs 404

Return `401 Unauthorized` (not `404 Not Found`) when a resource exists but belongs to a different session. Returning `404` leaks information about whether the resource exists at all.
