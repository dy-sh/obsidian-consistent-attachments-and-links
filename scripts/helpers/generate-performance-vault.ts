import type { PopulateFilesParams } from 'obsidian-integration-testing';

/**
 * The plugin under test. Must match `manifest.json`'s `id`; the
 * `bulk-delete.desktop-performance.integration.test.ts` test enables/disables it by
 * this id and the seeded `data.json` lives under `.obsidian/plugins/<id>/`.
 */
export const PLUGIN_ID = 'consistent-attachments-and-links';

/**
 * Folder whose notes are bulk-deleted while the plugin is ENABLED (with
 * `shouldDeleteAttachmentsWithNote` on). Each deletion drives one expensive
 * attachment-path resolution through the dev-utils delete handler, so the count of
 * resolutions over this folder is the bottleneck signature.
 */
export const PERFORMANCE_VAULT_PRIMARY_FOLDER = 'bulk-enabled';

/**
 * Folder whose notes are bulk-deleted while the plugin is DISABLED — the tripwire
 * baseline. With no delete handler registered, deleting these notes must trigger zero
 * attachment-path resolutions.
 */
export const PERFORMANCE_VAULT_BASELINE_FOLDER = 'bulk-disabled';

/**
 * How many notes each of the two folders holds. The bottleneck is per-deleted-note, so
 * total vault size is irrelevant — only this count drives the linear cost. Overridable
 * via `CAL_PERF_VAULT_NOTE_COUNT` for a quicker (smaller) or harsher (larger) run.
 */
const DEFAULT_PERFORMANCE_VAULT_NOTE_COUNT = 200;
export const PERFORMANCE_VAULT_NOTE_COUNT = Number(process.env['CAL_PERF_VAULT_NOTE_COUNT']) || DEFAULT_PERFORMANCE_VAULT_NOTE_COUNT;

/**
 * Plugin data seeded before Obsidian opens so the delete handler runs its expensive
 * path. `shouldDeleteAttachmentsWithNote` enables the handler; `shouldShowBackupWarning`
 * must be `false` or the plugin's load-time backup warning reverts the dangerous setting
 * back to `false` (see `PluginSettings.revertDangerousSettings`).
 */
const SEEDED_PLUGIN_DATA = {
  shouldDeleteAttachmentsWithNote: true,
  shouldShowBackupWarning: false
};

/**
 * Builds the file map for the performance vault, written to disk by
 * `TempVault.populate()` after the plugin is copied in but before Obsidian opens it. The
 * vault holds two folders of plain notes (one deleted with the plugin enabled, one with
 * it disabled) plus the seeded plugin `data.json`.
 *
 * @returns A map of vault-relative paths to content.
 */
export function generatePerformanceVault(): PopulateFilesParams {
  const files: PopulateFilesParams = {
    [`.obsidian/plugins/${PLUGIN_ID}/data.json`]: JSON.stringify(SEEDED_PLUGIN_DATA)
  };

  for (const folder of [PERFORMANCE_VAULT_PRIMARY_FOLDER, PERFORMANCE_VAULT_BASELINE_FOLDER]) {
    for (let noteIndex = 0; noteIndex < PERFORMANCE_VAULT_NOTE_COUNT; noteIndex++) {
      files[`${folder}/note-${String(noteIndex)}.md`] = `# Note ${String(noteIndex)}\n`;
    }
  }

  return files;
}
