# Privacy policy

Pinebery is a Chrome extension that reorganizes your open tabs into a tree-style view inside Chrome's side panel. This policy explains what information the extension touches, where it is stored, and what is never done with it.

Last updated: 2026-05-08

## Data the extension uses

To render the tree of open tabs, Pinebery reads metadata that Chrome exposes through its extension APIs:

- Tab metadata: URL, title, favicon URL, tab id, window id, opener tab id, pinned state, audio and mute state
- Tab group metadata: group id, name, color, collapsed state

Pinebery does not read the contents of the pages you visit, your browsing history, your bookmarks, your form inputs, your passwords, or any other data outside what the Chrome `tabs` and `tabGroups` APIs return for currently open tabs.

## Where data is stored

All data stays on your device. Pinebery uses `chrome.storage.local` to persist the tree structure (parent/child relationships, panel assignments, collapsed nodes), your settings (theme, density, close behavior, new-tab placement), and panel definitions. None of this is transmitted off your device.

## What Pinebery does not do

- No data is sent to any server. There is no Pinebery server.
- No analytics, telemetry, crash reporting, or tracking of any kind.
- No third-party services, SDKs, or libraries that contact remote endpoints.
- No data is sold, shared, or used for advertising.
- No data is used to build user profiles or for any purpose beyond the extension's stated functionality.

This use of data complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its Limited Use requirements.

## Permissions

- `tabs` — read open tab metadata (URL, title, favicon) and reorder or close tabs in response to your actions in the side panel.
- `tabGroups` — read tab group metadata so groups render correctly in the tree.
- `storage` — persist the tree, panels, and settings on your device.
- `sidePanel` — render the tree UI in Chrome's side panel.

## Contact

For privacy questions, reports, or concerns:

- Email: artur.maga17@gmail.com
- GitHub: https://github.com/tutss/pinebery/issues

## Changes

If this policy changes, the updated version will be posted at the same location and the "Last updated" date will be revised.
