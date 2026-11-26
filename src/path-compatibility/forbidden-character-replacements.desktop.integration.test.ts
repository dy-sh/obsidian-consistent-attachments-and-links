/**
 * @file
 *
 * Desktop integration suite for the per-character replacements of `Fix incompatible paths`: a character with
 * an entry in `Forbidden character replacements` gets that replacement, and every other forbidden character
 * gets the single `Forbidden character replacement`.
 *
 * The fixture name holds `[`, `]` and `#`, which Obsidian's links refuse under every platform profile while
 * NTFS stores them fine, so the file can exist on a Windows host. It is written through the adapter, because a
 * name that only Obsidian refuses is exactly the kind of name that arrives from outside Obsidian.
 *
 * Desktop-only (the file name alone picks the project), for the reason
 * `path-compatibility.desktop.integration.test.ts` gives.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const COMMAND_ID = `${PLUGIN_ID}:fix-incompatible-paths`;

describe('Fix incompatible paths with per-character replacements', () => {
  it('uses the replacement given for a character, and the single replacement for the rest', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        commandId,
        lib,
        pluginId
      }) {
        interface ReplacementSettings {
          // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests change this setting between scenarios to verify each configured behavior.
          forbiddenCharacterReplacement: string;
          // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests change this setting between scenarios to verify each configured behavior.
          forbiddenCharacterReplacements: string[];
          // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests change this setting between scenarios to verify each configured behavior.
          shouldEnsurePathCompatibilityOnWindows: boolean;
        }

        function isReplacementSettings(value: unknown): value is ReplacementSettings {
          return typeof value === 'object' && value !== null
            && Array.isArray((value as Record<string, unknown>)['forbiddenCharacterReplacements']);
        }

        // Walk the plugin's object graph to the live effective-settings object the command reads, the way
        // `path-compatibility.desktop.integration.test.ts` does. Mutating it needs no reload.
        function findSettings(): null | ReplacementSettings {
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
            if (isReplacementSettings(record['settings'])) {
              return record['settings'];
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
          return { settingsFound: false };
        }

        const originalReplacement = settings.forbiddenCharacterReplacement;
        const originalReplacements = settings.forbiddenCharacterReplacements;
        const wasWindowsEnabled = settings.shouldEnsurePathCompatibilityOnWindows;
        settings.forbiddenCharacterReplacement = '-';
        settings.forbiddenCharacterReplacements = ['[=(', ']=)'];
        settings.shouldEnsurePathCompatibilityOnWindows = true;

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderPath = `forbidden-character-replacements-${stamp}`;
        const oldPath = `${folderPath}/Report [draft] #1.md`;
        const expectedPath = `${folderPath}/Report (draft) -1.md`;

        await app.vault.createFolder(folderPath);
        await app.vault.adapter.write(oldPath, '# Report\n');

        try {
          await lib.waitUntil({
            message: `the vault to pick up ${oldPath}`,
            predicate: () => app.vault.getAbstractFileByPath(oldPath) !== null
          });

          app.commands.executeCommandById(commandId);

          const reviewSelector = '.consistent-attachments-and-links-path-compatibility-review';
          await lib.waitUntil({
            message: 'the path compatibility review to open',
            predicate: () => activeDocument.querySelector(`${reviewSelector} .mod-cta`) !== null
          });
          const reviewText = activeDocument.querySelector(reviewSelector)?.textContent ?? '';
          // A dispatched click, as in `path-compatibility.desktop.integration.test.ts`: the review is the
          // precondition here, and what this suite proves is the name the repair picks.
          activeDocument.querySelector<HTMLButtonElement>(`${reviewSelector} .mod-cta`)?.click();

          await lib.waitUntil({
            message: `${oldPath} to be renamed to ${expectedPath}`,
            predicate: () => app.vault.getAbstractFileByPath(expectedPath) !== null
          });

          return {
            isOldPathGone: app.vault.getAbstractFileByPath(oldPath) === null,
            reviewText,
            settingsFound: true
          };
        } finally {
          settings.forbiddenCharacterReplacement = originalReplacement;
          settings.forbiddenCharacterReplacements = originalReplacements;
          settings.shouldEnsurePathCompatibilityOnWindows = wasWindowsEnabled;
          const folder = app.vault.getFolderByPath(folderPath);
          if (folder) {
            await app.fileManager.trashFile(folder);
          }
        }
      },
      input: {
        commandId: COMMAND_ID,
        pluginId: PLUGIN_ID
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.settingsFound).toBe(true);
    expect(result.reviewText).toContain('Report (draft) -1.md');
    expect(result.isOldPathGone).toBe(true);
  });
});
