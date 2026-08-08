/**
 * @file
 *
 * Desktop integration suite for the `shouldCollectAttachmentsAutomatically` setting (GitHub issue #152):
 * with **Auto Collect Attachments** on, the plugin used to rename an attachment that was effectively
 * ALREADY at its proper path (parked with an Obsidian deduplication suffix because a different file
 * occupies the deduplication-free proper slot) forever — each rename updated the note link, which re-fired
 * `metadataCache('changed')`, which re-triggered auto-collect, in an endless background loop.
 *
 * It drives the REAL auto-collect flow — enabling the live setting and firing a genuine `vault.modify`
 * so the plugin's own registered `metadataCache('changed')` handler runs the collect — against a temp
 * vault whose Obsidian attachment folder is pointed at a dedicated subfolder. Two behaviors are asserted:
 *
 * 1. A genuinely misplaced attachment (at the vault root) IS collected into the proper folder.
 * 2. A deduplication-parked attachment (`… 1.png`, sitting at its proper path because a different file
 *    occupies the deduplication-free slot) is NOT renamed again — the collect converges after the one legitimate
 *    move, so no `… 2.png`/`… 3.png` escalation appears and the file stays put (the loop is broken).
 *
 * Desktop-only (per G47: the file name alone picks the project). No Android emulator is available in
 * this environment; the behavior itself is platform-agnostic, so this can become
 * `*.cross-platform.integration.test.ts` the day one is.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
// A generous window in which a still-looping (unfixed) auto-collect would escalate the deduplication suffix.
const SETTLE_IN_MILLISECONDS = 6000;

interface AutoCollectLoopResult {
  readonly collectedMisplaced: boolean;
  readonly escalatedSuffixExists: boolean;
  readonly parkedStillExists: boolean;
  readonly settingsFound: boolean;
}
describe('Auto-collect does not loop on already-proper attachments (issue #152)', () => {
  it('collects a misplaced attachment into its proper folder and does not re-collect the deduplication-parked one', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        lib: { waitUntil },
        pluginId,
        settleInMilliseconds,
        waitTimeoutInMilliseconds
      }): Promise<AutoCollectLoopResult> {
        interface AutoCollectSettings {
          shouldCollectAttachmentsAutomatically: boolean;
          shouldShowBackupWarning: boolean;
        }

        interface VaultConfigAccess {
          getConfig(key: string): unknown;
          setConfig(key: string, value: unknown): void;
        }

        function isAutoCollectSettings(value: unknown): value is AutoCollectSettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['shouldCollectAttachmentsAutomatically'] === 'boolean';
        }

        // Walk the plugin's object graph to reach the live effective-settings object its handlers read;
        // Mutating it changes the next collect's behavior with no reload.
        function findSettings(): AutoCollectSettings | null {
          const block = new Set(['app', 'containerEl', 'dom', 'metadataCache', 'plugins', 'vault', 'workspace']);
          const seen = new Set<unknown>();
          const queue: unknown[] = [app.plugins.getPlugin(pluginId)];
          let budget = 12_000;
          while (queue.length > 0 && budget-- > 0) {
            const current = queue.shift();
            if (current === null || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) {
              continue;
            }
            seen.add(current);
            const record = current as Record<string, unknown>;
            const candidate = record['settings'];
            if (isAutoCollectSettings(candidate)) {
              return candidate;
            }
            let values: unknown[] = [];
            if (Array.isArray(current)) {
              values = current;
            } else if (current instanceof Map) {
              values = [...current.values()];
            } else {
              for (const [key, value] of Object.entries(record)) {
                if (!block.has(key)) {
                  values.push(value);
                }
              }
            }
            for (const value of values) {
              if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
                queue.push(value);
              }
            }
          }
          return null;
        }

        const settings = findSettings();
        if (!settings) {
          return {
            collectedMisplaced: false,
            escalatedSuffixExists: false,
            parkedStillExists: false,
            settingsFound: false
          };
        }

        const vaultUnknown: unknown = app.vault;
        const vaultConfig = vaultUnknown as VaultConfigAccess;
        const priorAttachmentFolder = vaultConfig.getConfig('attachmentFolderPath');
        const isPriorAutoCollect = settings.shouldCollectAttachmentsAutomatically;

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const properFolder = `ac152-proper-${stamp}`;
        const srcFolder = `ac152-src-${stamp}`;
        const plainBase = `ac152-plain-${stamp}.png`;
        const dupBase = `ac152-dup-${stamp}.png`;
        const plainSrcPath = plainBase;
        const dupSrcPath = `${srcFolder}/${dupBase}`;
        const collisionPath = `${properFolder}/${dupBase}`;
        const expectedPlainProperPath = `${properFolder}/${plainBase}`;
        const expectedParkedPath = `${properFolder}/ac152-dup-${stamp} 1.png`;
        const escalatedPath = `${properFolder}/ac152-dup-${stamp} 2.png`;
        const plainNotePath = `ac152-note-plain-${stamp}.md`;
        const dupNotePath = `ac152-note-dup-${stamp}.md`;
        const createdPaths = [
          plainSrcPath,
          dupSrcPath,
          collisionPath,
          plainNotePath,
          dupNotePath,
          expectedPlainProperPath,
          expectedParkedPath,
          escalatedPath
        ];

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        try {
          // Point Obsidian's attachment folder at a dedicated subfolder so the "proper" path is a known
          // Non-root location and a root/other-folder attachment is genuinely misplaced.
          vaultConfig.setConfig('attachmentFolderPath', properFolder);

          for (const path of createdPaths) {
            await trashIfExists(path);
          }
          await app.vault.createFolder(properFolder).catch(() => undefined);
          await app.vault.createFolder(srcFolder).catch(() => undefined);

          // Scenario 1: a plainly misplaced attachment at the vault root.
          await app.vault.createBinary(plainSrcPath, new ArrayBuffer(4));
          // Scenario 2: a different file already occupies the deduplication-free proper slot (the collision) so the
          // Collected attachment must be parked at `… 1.png`.
          await app.vault.createBinary(collisionPath, new ArrayBuffer(8));
          await app.vault.createBinary(dupSrcPath, new ArrayBuffer(4));

          const plainNote = await app.vault.create(plainNotePath, `![[${plainSrcPath}]]\n`);
          const dupNote = await app.vault.create(dupNotePath, `![[${dupSrcPath}]]\n`);

          // Wait for the embeds to be indexed so collect has resolvable links to act on.
          await waitUntil({
            message: 'note embeds were not indexed',
            predicate: () =>
              (app.metadataCache.getFileCache(plainNote)?.embeds?.length ?? 0) > 0
              && (app.metadataCache.getFileCache(dupNote)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          // Turn on the real setting and fire genuine note changes so the plugin's own
          // MetadataCache('changed') handler drives auto-collect (the actual user flow).
          settings.shouldShowBackupWarning = false;
          settings.shouldCollectAttachmentsAutomatically = true;
          await app.vault.append(plainNote, '\n');
          await app.vault.append(dupNote, '\n');

          // The misplaced attachment lands at its proper path and the parked one at the `… 1.png` slot.
          await waitUntil({
            message: 'auto-collect did not move the attachments to their proper folder',
            predicate: () =>
              Boolean(app.vault.getAbstractFileByPath(expectedPlainProperPath))
              && Boolean(app.vault.getAbstractFileByPath(expectedParkedPath)),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          // Give any still-looping (unfixed) auto-collect ample time to escalate the deduplication suffix.
          await sleep(settleInMilliseconds);

          const isCollectedMisplaced = Boolean(app.vault.getAbstractFileByPath(expectedPlainProperPath))
            && !app.vault.getAbstractFileByPath(plainSrcPath);
          const isParkedStillExists = Boolean(app.vault.getAbstractFileByPath(expectedParkedPath));
          const isEscalatedSuffixExists = Boolean(app.vault.getAbstractFileByPath(escalatedPath));

          return {
            collectedMisplaced: isCollectedMisplaced,
            escalatedSuffixExists: isEscalatedSuffixExists,
            parkedStillExists: isParkedStillExists,
            settingsFound: true
          };
        } finally {
          settings.shouldCollectAttachmentsAutomatically = isPriorAutoCollect;
          for (const path of createdPaths) {
            await trashIfExists(path);
          }
          await trashIfExists(properFolder);
          await trashIfExists(srcFolder);
          vaultConfig.setConfig('attachmentFolderPath', priorAttachmentFolder);
        }
      },
      input: {
        pluginId: PLUGIN_ID,
        settleInMilliseconds: SETTLE_IN_MILLISECONDS,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.settingsFound).toBe(true);

    // A genuinely misplaced attachment was collected into its proper folder.
    expect(result.collectedMisplaced).toBe(true);

    // The deduplication-parked attachment stayed at its `… 1.png` slot — auto-collect converged.
    expect(result.parkedStillExists).toBe(true);

    // The loop is broken: no escalated `… 2.png` was produced by a re-triggered collect.
    expect(result.escalatedSuffixExists).toBe(false);
  });
});
