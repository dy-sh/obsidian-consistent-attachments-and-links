/**
 * @file
 *
 * Desktop integration suite for the `Fix incompatible paths` command (T698): the bulk repair of files whose
 * name or path is invalid on a platform the vault is synced to.
 *
 * It drives the REAL command through the command palette's own registry and asserts the observable effects a
 * user would see — the file is renamed, the link pointing at it still resolves, and the original name is
 * preserved in the note's `aliases` and `title`.
 *
 * The fixture is a 100-character CJK name with **Android** enabled and Windows disabled. That combination is
 * the only one this can be driven with on a Windows host: a name Windows itself rejects (`<`, `CON`, a
 * 300-character path) cannot be CREATED on NTFS in the first place, so there would be nothing to repair. 100
 * CJK characters are 300 UTF-8 bytes — over ext4's 255-byte limit and untouched by any limit Windows has —
 * which is exactly the case a character count gets wrong.
 *
 * Desktop-only (per G47: the file name alone picks the project). `manifest.json` declares
 * `isDesktopOnly: false` and the behavior is platform-agnostic, so this can become
 * `*.cross-platform.integration.test.ts` the day an Android emulator is available here — the same
 * documented gap `context-menu-toggle.desktop.integration.test.ts` carries.
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

// 100 × 3 bytes = 300, over the 255-byte per-name limit; 100 UTF-16 units, under every Windows limit.
const LONG_CJK_BASENAME = '文'.repeat(100);

describe('Fix incompatible paths (T698)', () => {
  it('renames a name that is too long in bytes, rewrites the link to it, and preserves the original name', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        commandId,
        lib,
        longBasename,
        pluginId
      }) {
        interface PathCompatibilitySettings {
          shouldEnsurePathCompatibilityOnAndroid: boolean;
          shouldEnsurePathCompatibilityOnWindows: boolean;
          sidecarNoteNamePattern: string;
        }

        function isPathCompatibilitySettings(value: unknown): value is PathCompatibilitySettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['sidecarNoteNamePattern'] === 'string';
        }

        // Walk the plugin's object graph to the live effective-settings object the command reads, the way
        // `context-menu-toggle.desktop.integration.test.ts` does. Mutating it needs no reload.
        function findSettings(): null | PathCompatibilitySettings {
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
            if (isPathCompatibilitySettings(record['settings'])) {
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

        const wasAndroidEnabled = settings.shouldEnsurePathCompatibilityOnAndroid;
        const wasWindowsEnabled = settings.shouldEnsurePathCompatibilityOnWindows;
        settings.shouldEnsurePathCompatibilityOnAndroid = true;
        settings.shouldEnsurePathCompatibilityOnWindows = false;

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderPath = `t698-${stamp}`;
        const targetPath = `${folderPath}/${longBasename}.md`;
        const sourcePath = `${folderPath}/source.md`;

        await app.vault.createFolder(folderPath);
        await app.vault.create(targetPath, '# Target\n');
        await app.vault.create(sourcePath, `# Source\n\n[target](<${longBasename}.md>)\n`);

        try {
          app.commands.executeCommandById(commandId);

          // The pass runs through a progress loop, so wait for the effect rather than for the call.
          await lib.waitUntil({
            message: `the long-named note at ${targetPath} to be renamed`,
            predicate: () => app.vault.getAbstractFileByPath(targetPath) === null
          });

          const renamed = app.vault.getFolderByPath(folderPath)?.children
            .filter((child) => child.name !== 'source.md')
            .map((child) => child.name) ?? [];
          const newName = renamed[0] ?? '';

          const sourceContent = await app.vault.adapter.read(sourcePath);
          const targetFile = app.vault.getFileByPath(`${folderPath}/${newName}`);
          const frontmatter = targetFile === null ? undefined : app.metadataCache.getFileCache(targetFile)?.frontmatter;

          return {
            aliases: (frontmatter?.['aliases'] as string[] | undefined) ?? [],
            newName,
            newNameByteLength: new Blob([newName]).size,
            settingsFound: true,
            sourceContent,
            title: frontmatter?.['title'] as string | undefined
          };
        } finally {
          settings.shouldEnsurePathCompatibilityOnAndroid = wasAndroidEnabled;
          settings.shouldEnsurePathCompatibilityOnWindows = wasWindowsEnabled;
          const folder = app.vault.getFolderByPath(folderPath);
          if (folder) {
            await app.fileManager.trashFile(folder);
          }
        }
      },
      input: {
        commandId: COMMAND_ID,
        longBasename: LONG_CJK_BASENAME,
        pluginId: PLUGIN_ID
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.settingsFound).toBe(true);

    // Renamed, and short enough that ext4 would accept it — including the `.md` extension, which is kept
    // Whole because it is what tells Obsidian the file is a note.
    expect(result.newName).not.toBe(`${LONG_CJK_BASENAME}.md`);
    expect(result.newName).toMatch(/\.md$/);
    expect(result.newNameByteLength).toBeLessThanOrEqual(255);

    /*
     * The link followed the rename. This is the whole reason the repair goes through
     * `fileManager.renameFile` rather than `vault.rename`. Obsidian writes a CJK target inside angle
     * brackets rather than percent-encoding it, so the new name appears verbatim.
     */
    expect(result.sourceContent).toContain(result.newName ?? '');
    expect(result.sourceContent).not.toContain(`${LONG_CJK_BASENAME}.md`);

    // Nothing is lost: the original name is recoverable from the note itself.
    expect(result.aliases).toContain(`${LONG_CJK_BASENAME}.md`);
    expect(result.title).toBe(`${LONG_CJK_BASENAME}.md`);
  });
});
