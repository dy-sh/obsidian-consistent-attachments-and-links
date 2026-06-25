# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Direction: stay Advanced-Exclude-agnostic; fix the root cause in dev-utils

This plugin must NOT couple to Advanced Exclude (no `app.advancedExclude` / no "bulk in
progress" signal handshake). A prototype that did (`app.advancedExclude.isApplyingProjection`
gating the settings builder's `isPathIgnored`) was committed then reverted (`3f2aa21` reverts
`d1c8b55`) precisely to keep the plugin agnostic.

The agnostic root cause was that the (dev-utils) delete handler acted on **index-only
removals**: a synthetic "delete" where the file still exists on disk. The fix — skip the
handler when `await app.vault.adapter.exists(path)` is true — had to be async, so it lives in
dev-utils' `RenameDeleteHandler`, not this plugin's sync `isPathIgnored`. It shipped in
`obsidian-dev-utils` 80.1.0; this plugin consumes it via `^80.1.0` with **no plugin code
change**, exactly as planned, and the freeze is confirmed gone end-to-end (see the tests
below).

This plugin keeps the agnostic integration tests in
`src/bulk-delete.desktop-performance.integration.test.ts` (vitest project
`integration-tests:desktop-performance`, run via `npm run test:integration:performance`):

- **O(N) reproduction** (commit `4d56efd`): a bulk **real** deletion (`trashFile`) of N notes
  resolves the attachment path exactly once per note (the freeze signature) — and zero times
  with the plugin disabled. Real deletions are inherently O(N); the fix does not (and must
  not) change this.
- **Index-only-removal skip** (the fix confirmation): firing one `vault.on('delete')` per note
  **without** removing it from disk — exactly what hiding a folder does — must resolve **zero**
  attachment paths, because the disk-existence guard skips every synthetic removal. A single
  real deletion enqueued last is the FIFO drain marker that proves the synthetic handlers
  actually ran.

> **The integration test runs the built bundle `dist/build`, not `node_modules`.** After any
> `obsidian-dev-utils` upgrade, `npm run build` first or the test silently exercises the stale
> pre-upgrade bundle. The index-only-removal test was first seen failing (200 resolutions
> instead of 0) purely because the bundle predated the 80.1.0 upgrade — rebuilding fixed it.
