# donechime

## 0.2.0

### Minor Changes

- 21636f7: Ship as a Claude Code plugin (manifest, hooks, marketplace) and write the bundled sounds on first play so no `donechime install` is needed.
- 21636f7: Add `--volume 0-100` to `donechime play` and a `volume` key in `~/.donechime.json`.

## 0.1.1

### Patch Changes

- ca15ad9: Fix sounds not playing from Claude Code hooks: play synchronously instead of in a detached process that was killed when the hook exited.

## 0.1.0

### Minor Changes

- 36d0125: Route attention by ear: add `donechime play`, hooks for `Stop`, `Notification` and `StopFailure` with distinct bundled sounds, a per-event cooldown, and an optional `~/.donechime.json` config. Replaces `addStopHook`/`removeStopHook` with `addHook`/`removeHooks`.
