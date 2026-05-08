# Pinebery

Tree-style vertical tabs in Chrome's side panel. Tabs opened from another tab become children of their parent; drag to re-parent with an indent-based drop indicator. Inspired by Firefox's [Sidebery](https://addons.mozilla.org/en-US/firefox/addon/sidebery/), adapted to Chrome's APIs.

## Features

- Tree-style tabs in the Chrome side panel, per-window
- Auto parent/child from `openerTabId`, manual drag re-parenting
- Configurable close-parent behavior (promote children or close subtree); Shift inverts the default
- Pinned tabs in a compact section at the top
- Chrome tab groups rendered as colored left-border bands
- Filter-only search with dimmed-ancestor context
- Multiple panels per window for grouping tabs into workspaces
- Light, dark, and system themes; comfortable and compact density
- Configurable placement rules for new tabs from links and blank tabs

## Development

```bash
npm install
npm run dev        # Vite dev server, port 5173
npm run build      # production build into dist/
npm run typecheck  # svelte-check, strict mode
npm run test       # Vitest single run
npm run test:e2e   # Playwright
```

Load the unpacked extension from `dist/` (or the dev build directory) in `chrome://extensions` with developer mode enabled.

## Stack

TypeScript, Svelte 5 (runes), Vite via `@crxjs/vite-plugin`, Manifest V3 with a service-worker background. State lives in `chrome.storage.local`, owned by the background worker; the side panel is a reactive view that exchanges typed messages with it.

## Constraints

- Chrome's native horizontal tab strip cannot be hidden by an extension. Both UIs are visible.
- The side panel side (left/right) is a Chrome user setting and cannot be moved programmatically.
- Tab groups must be contiguous in window tab order. v1 handles this passively: Chrome auto-ungroups violating tabs and the extension syncs that back.
- Cross-browser-restart tree preservation is out of scope for v1. After a restart the tree rebuilds from `openerTabId` only.

## Project layout

- `src/background/` — service worker, pure tree ops, persistence, Chrome listeners
- `src/sidepanel/` — Svelte 5 panel app, stores, drag-and-drop, components
- `src/options/` — options page (tabs, appearance, about)
- `src/shared/` — types and message schemas shared by both halves
- `tests/unit/` — Vitest units for pure modules
- `tests/e2e/` — Playwright e2e against the unpacked extension
