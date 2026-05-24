# Changelog

## v1.2.3 - 2026-05-24

### Bug fixes

- place Cmd+T tabs as roots instead of children ([186a80a](https://github.com/tutss/pinebery/commit/186a80ace16d298a5e020befe283b0d3b906227f))

## v1.2.2 - 2026-05-24

### Bug fixes

- recover tabs stranded in deleted panels on rehydrate ([d3249e1](https://github.com/tutss/pinebery/commit/d3249e138a5b27f34d7bcbc0c793839f2d131ac0))

## v1.2.1 - 2026-05-24

### Bug fixes

- disable tab reorder from Chrome strip moves (#2) ([1ccdb29](https://github.com/tutss/pinebery/commit/1ccdb29136b678f144ea07f7a4b98ee1f5de73fd))
- self-heal missing tabs in handleTabUpdated (#1) ([de15bcf](https://github.com/tutss/pinebery/commit/de15bcf2a05b6eb2b3c9a24a132d9b7f717d37c4))
- preserve custom panels across Chrome restart (#3) ([fff7cee](https://github.com/tutss/pinebery/commit/fff7ceed59e865971586241a0eb514cd574a51bb))
- keep pinned tabs as roots during rehydration and pin events ([d040716](https://github.com/tutss/pinebery/commit/d040716e9849aba008454b8d5995e905a0dad245))

## v1.2.0 - 2026-05-23

### Features

- add vertical indent guides to clarify tree hierarchy ([5dc1564](https://github.com/tutss/pinebery/commit/5dc1564ce9eba700c5b0c5d538f28a3318962351))

## v1.1.1 - 2026-05-21

### Bug fixes

- use chrome://favicon2/ fallback and add error recovery for tab favicons ([d956838](https://github.com/tutss/pinebery/commit/d956838794a3cc4c6ac4b62ca7d8e1f042efad1a))

## v1.1.0 - 2026-05-11

### Other

- move dev specs to SPEC/ and ignore the folder ([f1ab7d9](https://github.com/tutss/pinebery/commit/f1ab7d9ff2101482d5b7610d16ce3a2509620aef))
- Add tab rename feature, scroll fix, and v1.0.0 release prep ([3046b2f](https://github.com/tutss/pinebery/commit/3046b2f7810dd5cf3ede4ff2d79d4112ac9c5376))
- add release tooling (/release, pre-push hook, changelog) ([b13368b](https://github.com/tutss/pinebery/commit/b13368b1fbe3d92f24dc33f915475ebc31e4e0b5))

## v1.0.0 - 2026-05-08

Initial public release.

### Features

- Tree-style vertical tabs in Chrome's Side Panel
- Drag-and-drop reordering with indent-based drop semantics
- Multiple panels (workspaces) per window
- Light, dark, and system themes; comfortable and compact density
- Configurable new tab placement (from links and blank tabs)
- Default close behavior (promote children or close subtree, with Shift to invert)
- Chrome tab group color band indicators
- Pinned tabs section
- Keyboard navigation (Arrow Up/Down, Delete, Shift+Delete)
- Tab filter
- Right-click "Move to panel" menu
