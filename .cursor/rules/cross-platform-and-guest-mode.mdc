---
description: Every change must work across all platforms and environments. New features require an explicit guest mode decision.
alwaysApply: true
---

# Cross-Platform Compatibility & Guest Mode

## Every Change Must Work On All Platforms

Before completing any change, verify it does not break:

- **Web (guest mode)** — `checker.proxyscrape.com`, no login, restricted features
- **Web (logged-in)** — same domain but authenticated
- **Desktop (Electron) macOS** — packaged app, local Go backend
- **Desktop (Electron) Windows** — same, different OS paths/APIs
- **Dev mode** — `npm run dev` / Vite HMR, both guest and desktop

If a change is intentionally platform-specific (e.g. a file only used in Electron), call that out explicitly in your response.

## New Features Require a Guest Mode Decision

When implementing any new feature, **stop and ask the user** before proceeding:

> "Should this feature be available in guest mode? If yes, consider these limitations: [list relevant ones]"

Suggest relevant limitations based on the feature, e.g.:
- **Rate / quota limits** — cap usage to prevent abuse (e.g. max proxies per check, session duration)
- **No persistence** — guest sessions are ephemeral; results/history may not survive a reload
- **No auth-gated data** — guest users cannot access account-specific data
- **UI gating** — disabled controls should look visually disabled and explain why on hover

## Guest Mode Enforcement Pattern

When a feature is blocked in guest mode, follow this pattern:

- Disable the control visually (reduced opacity, `aria-disabled`)
- Show a tooltip on hover explaining the limitation and encouraging download/sign-up
- Never silently ignore input — always give the user feedback
- Backend must enforce the restriction server-side; frontend gating is UX only
