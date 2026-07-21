import type { GetAvailablePathForAttachmentsExtendedFnParams } from 'obsidian-dev-utils/obsidian/attachment-path';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  PERFORMANCE_VAULT_BASELINE_FOLDER,
  PERFORMANCE_VAULT_NOTE_COUNT,
  PERFORMANCE_VAULT_PRIMARY_FOLDER,
  PLUGIN_ID
} from '../scripts/helpers/generate-performance-vault.ts';

/*
 * Real-Obsidian reproduction of the bulk-deletion freeze. When a folder of N notes is
 * deleted in one burst, Obsidian fires one `vault.on('delete')` per descendant, and the
 * dev-utils `RenameDeleteHandlerComponent` this plugin registers runs `handleDelete` for
 * each — resolving the note's attachment folder via
 * `app.vault.getAvailablePathForAttachments.extended`. That `extended` seam is exactly
 * what `custom-attachment-location` patches with its expensive resolver in the real vault,
 * so a bulk delete becomes O(N) expensive resolutions and freezes the UI.
 *
 * This test installs its OWN counting + delaying `extended` stub standing in for
 * `custom-attachment-location` (the temp vault has no such plugin), so the cost is
 * deterministic and the structural bottleneck is provable without a 90k-file vault:
 *
 *   - With the plugin ENABLED and `shouldDeleteAttachmentsWithNote` on (seeded in
 *     data.json), deleting N notes must call the resolver exactly N times and take
 *     ~N × per-call cost — the O(N) freeze signature.
 *   - With the plugin DISABLED (the tripwire baseline), deleting N notes must call the
 *     resolver zero times — proving the handler, not the deletion itself, is the cost.
 */

const SCENARIO_TIMEOUT_IN_MS = 300_000;

// Time to wait for Obsidian's startup scan to index both bulk folders before deleting.
const INDEX_WAIT_IN_MS = 60_000;
const INDEX_POLL_IN_MS = 500;

// Time to wait for the dev-utils operation queue to drain the per-note delete handlers.
const QUEUE_DRAIN_WAIT_IN_MS = 180_000;
const QUEUE_DRAIN_POLL_IN_MS = 100;

// After deleting with the plugin disabled, the test lets any stray queued work settle and then asserts the resolver was never called.
const BASELINE_SETTLE_IN_MS = 5_000;

// Models custom-attachment-location's expensive resolver: each per-note resolution costs this much, so a bulk delete of N notes costs about N times this cost. Chosen large enough that the handler's serial cost dominates real trash-I/O jitter.
const SIMULATED_ATTACHMENT_PATH_COST_IN_MS = 25;

// The enabled bulk delete must take at least this fraction of the modeled linear cost (N × per-call cost). The drain loop waits for all N resolutions, so this floor is robust.
const MIN_LINEAR_COST_FRACTION = 0.5;

describe('bulk-deletion delete-handler bottleneck', () => {
  it('resolves the attachment path once per deleted note (O(N) freeze), and not at all without the handler', async () => {
    const result = await evalInObsidian({
      args: {
        BASELINE_FOLDER: PERFORMANCE_VAULT_BASELINE_FOLDER,
        BASELINE_SETTLE_IN_MS,
        INDEX_POLL_IN_MS,
        INDEX_WAIT_IN_MS,
        NOTE_COUNT: PERFORMANCE_VAULT_NOTE_COUNT,
        PLUGIN_ID,
        PRIMARY_FOLDER: PERFORMANCE_VAULT_PRIMARY_FOLDER,
        QUEUE_DRAIN_POLL_IN_MS,
        QUEUE_DRAIN_WAIT_IN_MS,
        SIMULATED_ATTACHMENT_PATH_COST_IN_MS
      },
      async fn({
        app,
        BASELINE_FOLDER: baselineFolder,
        BASELINE_SETTLE_IN_MS: baselineSettleMs,
        INDEX_POLL_IN_MS: indexPollMs,
        INDEX_WAIT_IN_MS: indexWaitMs,
        NOTE_COUNT: noteCount,
        PLUGIN_ID: pluginId,
        PRIMARY_FOLDER: primaryFolder,
        QUEUE_DRAIN_POLL_IN_MS: queueDrainPollMs,
        QUEUE_DRAIN_WAIT_IN_MS: queueDrainWaitMs,
        SIMULATED_ATTACHMENT_PATH_COST_IN_MS: simulatedCostMs
      }) {
        // Path whose parent folder does not exist, so the dev-utils delete handler resolves it, finds no attachment folder, and returns after exactly one resolver call.
        const NONEXISTENT_ATTACHMENT_PATH = '__perf_nonexistent_attachment_folder__/dummy.png';

        const expectedTotalNoteCount = noteCount * 2;
        const indexDeadline = performance.now() + indexWaitMs;
        while (app.vault.getMarkdownFiles().length < expectedTotalNoteCount && performance.now() < indexDeadline) {
          await sleep(indexPollMs);
        }
        const observedNoteCount = app.vault.getMarkdownFiles().length;
        if (observedNoteCount < expectedTotalNoteCount) {
          return {
            baselineMs: -1,
            baselineResolverCalls: -1,
            enabledMs: -1,
            enabledResolverCalls: -1,
            error: `Vault did not index both bulk folders in time (saw ${String(observedNoteCount)} of ${String(expectedTotalNoteCount)} notes).`,
            expectedNoteCount: noteCount,
            observedNoteCount
          };
        }

        // Install the counting and delaying resolver into the seam custom-attachment-location patches: the handler reads `app.vault.getAvailablePathForAttachments.extended`.
        const resolverState = { calls: 0 };
        Object.assign(app.vault.getAvailablePathForAttachments, {
          extended: async (): Promise<string> => {
            await sleep(simulatedCostMs);
            resolverState.calls++;
            return NONEXISTENT_ATTACHMENT_PATH;
          }
        });

        const primaryFiles = collectFolderNotes(primaryFolder);
        if (primaryFiles.length !== noteCount) {
          return {
            baselineMs: -1,
            baselineResolverCalls: -1,
            enabledMs: -1,
            enabledResolverCalls: -1,
            error: `Expected ${String(noteCount)} notes in ${primaryFolder}, found ${String(primaryFiles.length)}.`,
            expectedNoteCount: noteCount,
            observedNoteCount
          };
        }

        // Enabled phase: bulk-delete while the plugin handles deletions. The resolver count starts at zero (nothing has been deleted yet), so it is never reset.
        const enabledStart = performance.now();
        for (const file of primaryFiles) {
          await app.fileManager.trashFile(file);
        }
        const drainDeadline = performance.now() + queueDrainWaitMs;
        while (resolverState.calls < noteCount && performance.now() < drainDeadline) {
          await sleep(queueDrainPollMs);
        }
        const enabledMs = performance.now() - enabledStart;
        const enabledResolverCalls = resolverState.calls;

        // Baseline phase: same bulk delete with no delete handler registered. Baseline calls are the delta over the enabled total, avoiding a reset of the shared counter.
        await app.plugins.disablePlugin(pluginId);
        const baselineFiles = collectFolderNotes(baselineFolder);
        const baselineStart = performance.now();
        for (const file of baselineFiles) {
          await app.fileManager.trashFile(file);
        }
        // Measure the deletion loop alone; the settle that follows only gives any stray handler a chance to run and must not count toward the baseline timing.
        const baselineMs = performance.now() - baselineStart;
        await sleep(baselineSettleMs);
        const baselineResolverCalls = resolverState.calls - enabledResolverCalls;

        await app.plugins.enablePlugin(pluginId);

        return {
          baselineMs,
          baselineResolverCalls,
          enabledMs,
          enabledResolverCalls,
          error: null,
          expectedNoteCount: noteCount,
          observedNoteCount
        };

        function collectFolderNotes(folder: string): ReturnType<typeof app.vault.getMarkdownFiles> {
          const prefix = `${folder}/`;
          return app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(prefix));
        }
      },
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    // Both bulk folders were indexed before the test deleted anything.
    expect(result.observedNoteCount).toBe(result.expectedNoteCount * 2);
    // The freeze signature: one expensive attachment-path resolution per deleted note.
    expect(result.enabledResolverCalls).toBe(PERFORMANCE_VAULT_NOTE_COUNT);
    // Without the delete handler, deleting the same number of notes resolves nothing.
    expect(result.baselineResolverCalls).toBe(0);
    // The enabled bulk delete spends at least the modeled handler cost (~N × per-call cost), so its wall-time grows linearly with the note count — the freeze.
    expect(result.enabledMs).toBeGreaterThanOrEqual(
      PERFORMANCE_VAULT_NOTE_COUNT * SIMULATED_ATTACHMENT_PATH_COST_IN_MS * MIN_LINEAR_COST_FRACTION
    );
  }, SCENARIO_TIMEOUT_IN_MS);

  /*
   * End-to-end confirmation of the freeze FIX (dev-utils >= 80.1.0). The freeze was driven by
   * INDEX-ONLY removals: hiding a folder removes each descendant from Obsidian's index (firing
   * one `vault.on('delete')` per note) while the file stays on disk. The fix makes the
   * dev-utils delete handler skip any "delete" whose path still exists on disk, so those
   * synthetic removals resolve zero attachment paths — no per-note resolver storm, no freeze.
   *
   * The O(N) test above uses REAL `trashFile` deletions (file leaves disk), which the guard
   * does NOT — and should not — skip, so it never exercises the fix. This case fires a
   * synthetic `vault.on('delete')` per note WITHOUT removing it from disk and asserts the
   * handler resolves nothing.
   *
   * To prove the synthetic handlers actually RAN (rather than asserting zero against work that
   * never started), it enqueues a single REAL deletion LAST as a drain marker. The dev-utils
   * operation queue is strictly serial/FIFO, so once the marker's resolution is observed every
   * prior synthetic handler has already drained. The resolver stub buckets calls by note path,
   * so the marker's one resolution is distinguishable from any (regression-only) synthetic one.
   */
  it('skips the delete handler for index-only removals, resolving no attachment paths', async () => {
    const result = await evalInObsidian({
      args: {
        DRAIN_POLL_IN_MS: QUEUE_DRAIN_POLL_IN_MS,
        DRAIN_WAIT_IN_MS: QUEUE_DRAIN_WAIT_IN_MS,
        INDEX_ONLY_DELETE_COUNT: PERFORMANCE_VAULT_NOTE_COUNT,
        SIMULATED_ATTACHMENT_PATH_COST_IN_MS
      },
      async fn({
        app,
        DRAIN_POLL_IN_MS: drainPollMs,
        DRAIN_WAIT_IN_MS: drainWaitMs,
        INDEX_ONLY_DELETE_COUNT: indexOnlyDeleteCount,
        SIMULATED_ATTACHMENT_PATH_COST_IN_MS: simulatedCostMs
      }) {
        const SYNTHETIC_FOLDER = '__perf_index_only_delete__';
        const MARKER_PATH = `${SYNTHETIC_FOLDER}/__drain_marker__.md`;
        const NONEXISTENT_ATTACHMENT_PATH = '__perf_nonexistent_attachment_folder__/dummy.png';

        // Bucket each resolution by the note being resolved: the marker (a real deletion), a synthetic index-only note, or anything unexpected.
        const resolverCalls = {
          marker: 0,
          other: 0,
          synthetic: 0
        };
        Object.assign(app.vault.getAvailablePathForAttachments, {
          extended: async (params: GetAvailablePathForAttachmentsExtendedFnParams): Promise<string> => {
            await sleep(simulatedCostMs);
            const notePath = typeof params.notePathOrFile === 'string' ? params.notePathOrFile : params.notePathOrFile?.path ?? '';
            if (notePath === MARKER_PATH) {
              resolverCalls.marker++;
            } else if (notePath.startsWith(`${SYNTHETIC_FOLDER}/`)) {
              resolverCalls.synthetic++;
            } else {
              resolverCalls.other++;
            }
            return NONEXISTENT_ATTACHMENT_PATH;
          }
        });

        // Create N notes that REMAIN on disk. Firing `vault.on('delete')` for each is an index-only removal (what hiding a folder does), so the handler's disk-existence guard must skip every one.
        await app.vault.createFolder(SYNTHETIC_FOLDER);
        const syntheticFiles: Awaited<ReturnType<typeof app.vault.create>>[] = [];
        for (let noteIndex = 0; noteIndex < indexOnlyDeleteCount; noteIndex++) {
          syntheticFiles.push(await app.vault.create(`${SYNTHETIC_FOLDER}/note-${String(noteIndex)}.md`, `# Note ${String(noteIndex)}\n`));
        }

        for (const file of syntheticFiles) {
          app.vault.trigger('delete', file);
        }

        // FIFO drain marker: a single REAL deletion enqueued after every synthetic op. Its resolution can only happen once all prior synthetic ops have drained.
        const markerFile = await app.vault.create(MARKER_PATH, '# Marker\n');
        await app.fileManager.trashFile(markerFile);

        const drainDeadline = performance.now() + drainWaitMs;
        while (resolverCalls.marker === 0 && performance.now() < drainDeadline) {
          await sleep(drainPollMs);
        }

        return {
          indexOnlyDeleteCount,
          markerResolverCalls: resolverCalls.marker,
          otherResolverCalls: resolverCalls.other,
          syntheticResolverCalls: resolverCalls.synthetic
        };
      },
      vaultPath: getTempVault().path
    });

    // The marker (a real deletion) drained the serial queue, proving the synthetic handlers actually ran rather than never starting.
    expect(result.markerResolverCalls).toBe(1);
    // The fix: every index-only removal (file still on disk) is skipped, so none of them resolve an attachment path.
    expect(result.syntheticResolverCalls).toBe(0);
    // Sanity: nothing other than the marker was ever resolved.
    expect(result.otherResolverCalls).toBe(0);
  }, SCENARIO_TIMEOUT_IN_MS);
});
