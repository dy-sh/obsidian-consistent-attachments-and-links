# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code
in this repository.

## Direction: stay Advanced-Exclude-agnostic; fix the root cause in dev-utils

This plugin must NOT couple to Advanced Exclude (no `app.advancedExclude` / no "bulk in
progress" signal handshake). A prototype that did (`app.advancedExclude.isApplyingProjection`
gating the settings builder's `isPathIgnored`) was committed then reverted (`3f2aa21` reverts
`d1c8b55`) precisely to keep the plugin agnostic.

The agnostic root cause is that the (dev-utils) delete handler acts on **index-only
removals**: a synthetic "delete" where the file still exists on disk. The fix — skip the
handler when `await app.vault.adapter.exists(path)` is true — must be async, so it lives in
dev-utils' `RenameDeleteHandler`, not this plugin's sync `isPathIgnored`. It is tracked as a
Known Issue in `obsidian-dev-utils/CLAUDE.md` ("`RenameDeleteHandler` acts on synthetic
(index-only) deletions"); once it ships, this plugin just rebuilds against the new dev-utils —
no plugin code change needed.

This plugin keeps only the agnostic reproduction test
(`src/bulk-delete.desktop-performance.integration.test.ts`, commit `4d56efd`).

## Known Issues

### Delete/rename handler does O(vault) work per file → bulk-deletion freeze (RESOLVED via dev-utils ≥ 80.1.0)

**Resolution (2026-06-25):** the agnostic dev-utils fix shipped — `DeleteHandler.handle`
early-returns when the deleted path still exists on disk (`await app.vault.adapter.exists(path)`),
skipping synthetic index-only removals. This plugin now consumes it via `obsidian-dev-utils ^80.1.0`
with no plugin code change, exactly as predicted below. Re-run
`src/bulk-delete.desktop-performance.integration.test.ts` to confirm the freeze is gone end to end,
then this entry can be deleted.

Measured 2026-06-22 by CPU-profiling the real vault `F:\Obsidian` (~90k files) while
Advanced Exclude hid a large folder in `Full` mode. Hiding a folder makes Obsidian run
its internal `removeFile` cascade once per descendant file (~943 files in the test), and
this plugin's per-file event handler runs for each one and does expensive work — making a
single bulk operation O(N × cost) and freezing the UI for tens of seconds.

- **Contribution to the freeze: ~33–44 s** for ~943 files (the joint-largest contributor,
  together with `custom-attachment-location` which it calls).
- **Call path** (built bundle): the handler `handle` (~line 433) → `In` (~line 399) →
  `Gt`, which then calls `getAvailablePathForAttachments` from
  `obsidian-custom-attachment-location` (~22 s of the above) per file. So this plugin both
  spends its own time and drives `custom-attachment-location`'s expensive path resolution
  on every deleted/renamed file.

**Important correctness note:** Advanced Exclude's "deletions" are **synthetic** — it
removes a file from Obsidian's index to hide it, but the file still exists on disk.
Treating these as real deletions/renames is not only slow but potentially wrong (e.g.
cleaning up "orphaned" attachments or rewriting links for files that were merely hidden).

**Fix (chosen, agnostic — tracked in `obsidian-dev-utils/CLAUDE.md`):** the handler should
skip when the deleted file **still exists on disk** (`await app.vault.adapter.exists(path)`),
because a "delete" whose path still exists is an index-only removal, not a real deletion. This
is plugin-agnostic (works for any hiding mechanism, no Advanced Exclude coupling) and fixes
both the freeze and the synthetic-deletion correctness hazard. It must be async, so it lives in
dev-utils' `RenameDeleteHandler`, not this plugin. Advanced Exclude's
`docs/working-with-other-plugins.md` also documents its own preferred S6 (direct index
mutation, no `reconcileDeletion` → no per-file events at all), which would make this moot for
its hides; the disk-existence guard still protects against any other index-only remover.

**Reproduced by:** `src/bulk-delete.desktop-performance.integration.test.ts` (vitest project
`integration-tests:desktop-performance`, run via `npm run test:integration:performance`).
It seeds `shouldDeleteAttachmentsWithNote: true` + `shouldShowBackupWarning: false`, installs
a counting/delaying `app.vault.getAvailablePathForAttachments.extended` stub standing in for
`custom-attachment-location`, bulk-deletes a folder of N notes, and proves the handler calls
the resolver exactly once per deleted note (O(N)) — and zero times with the plugin disabled.
The per-note resolution is the joint root of the freeze; the fix must stop it running per
file during a bulk burst. Set `CAL_PERF_VAULT_NOTE_COUNT` to scale N.
