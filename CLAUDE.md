# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Direction: stay Advanced-Exclude-agnostic; fix the root cause in dev-utils

This plugin must NOT couple to Advanced Exclude — no `app.advancedExclude`, no "bulk in
progress" signal handshake. (A prototype gating the settings builder's `isPathIgnored` on
`app.advancedExclude.isApplyingProjection` was committed then reverted precisely to keep the
plugin agnostic.)

The bulk-deletion freeze was caused by the dev-utils delete handler acting on **index-only
removals** — a synthetic `vault.on('delete')` where the file still exists on disk (e.g. when a
folder is hidden). The agnostic fix skips the handler when `await app.vault.adapter.exists(path)`
is true; because it is async it lives in dev-utils' `RenameDeleteHandler`, not this plugin's sync
`isPathIgnored`. It ships in `obsidian-dev-utils` `>= 80.1.0` and requires no plugin code change.

## Integration tests

`src/bulk-delete.desktop-performance.integration.test.ts` (vitest project
`integration-tests:desktop-performance`, run via `npm run test:integration:desktop:performance`)
guards the fix:

- **O(N) reproduction**: a bulk **real** deletion (`trashFile`) of N notes resolves the
  attachment path exactly once per note — and zero times with the plugin disabled. Real
  deletions are inherently O(N); the fix does not (and must not) change this.
- **Index-only-removal skip**: firing one `vault.on('delete')` per note **without** removing it
  from disk must resolve **zero** attachment paths, because the disk-existence guard skips every
  synthetic removal. A single real deletion enqueued last is the FIFO drain marker proving the
  synthetic handlers actually ran.

> The integration test runs the built bundle `dist/build`, not `node_modules`. After any
> `obsidian-dev-utils` upgrade, run `npm run build` first or the test silently exercises the
> stale pre-upgrade bundle.
