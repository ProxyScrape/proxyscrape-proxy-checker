import { shell } from 'electron';

// ─── Link-opening helpers ────────────────────────────────────────────────────
//
// Always use these instead of bare `href` + `target` attributes on elements.
//
//   openPsLink  →  proxyscrape.com URLs
//                  Electron: opens in system browser
//                  Web (standalone or iframe): navigates the top-level tab via
//                  window.top.location.href — never triggers popup blockers
//
//   openLink    →  third-party external URLs (GitHub, social media, docs…)
//                  Electron: opens in system browser
//                  Web: opens in a new tab
//
// Usage:
//   <Box component="a" href={psUrl('/premium', 'upsell')} onClick={openPsLink}>…</Box>
//   <Box component="a" href="https://github.com/…"        onClick={openLink}>…</Box>
//
// ─────────────────────────────────────────────────────────────────────────────

export const openPsLink = e => {
    e.preventDefault();
    const url = e.currentTarget.href;
    if (typeof window !== 'undefined' && window.__ELECTRON__) {
        shell.openExternal(url);
    } else {
        // Direct assignment avoids browser popup-blocker interference.
        // window.top === window in standalone mode; breaks out of iframe otherwise.
        window.top.location.href = url;
    }
};

export const openLink = e => {
    e.preventDefault();
    shell.openExternal(e.currentTarget.href);
};
