/**
 * @file
 *
 * Desktop integration suite for the `Normalize Unicode names to NFC` rule of `Fix incompatible paths`: a name
 * stored on disk in decomposed form (NFD) is renamed on disk to its composed form (NFC).
 *
 * The fixture is written straight to disk with `fs`, the way such names arrive in a real vault (an old macOS
 * volume, an archive, another tool). Obsidian cannot create one itself: it composes every name it creates.
 * It then indexes the file under the NFC vault path and keeps the NFD name in the adapter entry's
 * `realpath`, which is exactly the state the repair has to read.
 *
 * The assertion that matters most is the one a unit test cannot make: the note is STILL IN THE VAULT well
 * after the rename. A bare `fs.rename` passes every other check here, and then the watcher's report of the
 * old name reads as a deletion and removes the note 100 ms later.
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

// `й` composed (U+0439); its NFD form is `и` (U+0438) followed by U+0306 COMBINING BREVE.
const NFC_NOTE_BASENAME = 'заметка-й';
const NFC_FOLDER_NAME = 'папка-й';

// Longer than the watcher's deferred-deletion retry (100 ms), with margin for a busy machine.
const SETTLE_IN_MILLISECONDS = 1500;

describe('Normalize Unicode names to NFC', () => {
  it('renames a decomposed file and folder on disk, keeps them in the vault, and keeps the link resolving', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        commandId,
        lib,
        nfcFolderName,
        nfcNoteBasename,
        pluginId,
        settleInMilliseconds
      }) {
        interface UnicodeSettings {
          shouldEnsurePathCompatibilityOnAndroid: boolean;
          shouldEnsurePathCompatibilityOnEveryPlatform: boolean;
          shouldEnsurePathCompatibilityOnWindows: boolean;
          shouldNormalizeUnicodeNames: boolean;
        }

        function isUnicodeSettings(value: unknown): value is UnicodeSettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['shouldNormalizeUnicodeNames'] === 'boolean';
        }

        // Walk the plugin's object graph to the live settings object the command reads, as
        // `path-compatibility.desktop.integration.test.ts` does. Mutating it needs no reload.
        function findSettings(): null | UnicodeSettings {
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
            if (isUnicodeSettings(record['settings'])) {
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

        const savedSettings = { ...settings };
        // Every platform rule off, so the Unicode rule is the only thing the command can act on.
        settings.shouldEnsurePathCompatibilityOnAndroid = false;
        settings.shouldEnsurePathCompatibilityOnEveryPlatform = false;
        settings.shouldEnsurePathCompatibilityOnWindows = false;
        settings.shouldNormalizeUnicodeNames = true;

        interface AdapterFileEntry {
          realpath: string;
        }

        interface RawAdapter {
          files: Record<string, AdapterFileEntry | undefined>;
          fsPromises: typeof import('node:fs/promises');
          getFullRealPath: (realPath: string) => string;
        }

        const adapter = app.vault.adapter as RawAdapter & typeof app.vault.adapter;

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const rootPath = `unicode-normalization-${stamp}`;
        const notePath = `${rootPath}/${nfcNoteBasename}.md`;
        const folderPath = `${rootPath}/${nfcFolderName}`;
        const childPath = `${folderPath}/child.md`;
        const sourcePath = `${rootPath}/source.md`;

        function getRealPath(path: string): string | undefined {
          return adapter.files[path]?.realpath;
        }

        async function listDisk(realFolderPath: string): Promise<string[]> {
          return await adapter.fsPromises.readdir(adapter.getFullRealPath(realFolderPath));
        }

        try {
          await app.vault.createFolder(rootPath);
          await adapter.fsPromises.writeFile(adapter.getFullRealPath(notePath.normalize('NFD')), '# Decomposed\n');
          await adapter.fsPromises.mkdir(adapter.getFullRealPath(folderPath.normalize('NFD')));
          await adapter.fsPromises.writeFile(adapter.getFullRealPath(childPath.normalize('NFD')), '# Child\n');

          await lib.waitUntil({
            message: `the vault to index the decomposed names under ${rootPath}`,
            predicate: () => app.vault.getFileByPath(notePath) !== null && app.vault.getFileByPath(childPath) !== null
          });

          await app.vault.create(sourcePath, `# Source\n\n[[${nfcNoteBasename}]]\n`);
          await lib.waitUntil({
            message: `the link from ${sourcePath} to resolve`,
            predicate: () => app.metadataCache.resolvedLinks[sourcePath]?.[notePath] === 1
          });

          const realPathsBefore = { folder: getRealPath(folderPath), note: getRealPath(notePath) };

          app.commands.executeCommandById(commandId);

          await lib.waitUntil({
            message: `the decomposed names under ${rootPath} to be stored in NFC`,
            predicate: () => getRealPath(notePath) === notePath && getRealPath(folderPath) === folderPath
          });

          await new Promise((resolve) => {
            window.setTimeout(resolve, settleInMilliseconds);
          });

          return {
            childContent: await app.vault.adapter.read(childPath),
            diskFolderNames: await listDisk(folderPath),
            diskRootNames: await listDisk(rootPath),
            isChildInVault: app.vault.getFileByPath(childPath) !== null,
            isFolderInVault: app.vault.getFolderByPath(folderPath) !== null,
            isLinkResolved: app.metadataCache.resolvedLinks[sourcePath]?.[notePath] === 1,
            isNoteInVault: app.vault.getFileByPath(notePath) !== null,
            realPathsBefore,
            settingsFound: true
          };
        } finally {
          Object.assign(settings, savedSettings);
          const folder = app.vault.getFolderByPath(rootPath);
          if (folder) {
            await app.fileManager.trashFile(folder);
          }
        }
      },
      input: {
        commandId: COMMAND_ID,
        nfcFolderName: NFC_FOLDER_NAME,
        nfcNoteBasename: NFC_NOTE_BASENAME,
        pluginId: PLUGIN_ID,
        settleInMilliseconds: SETTLE_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.settingsFound).toBe(true);

    // The fixture really was decomposed on disk, which is what makes the rest of this mean anything.
    expect(result.realPathsBefore?.note).toMatch(new RegExp(String.raw`${NFC_NOTE_BASENAME.normalize('NFD')}\.md$`));
    expect(result.realPathsBefore?.folder).toMatch(new RegExp(`${NFC_FOLDER_NAME.normalize('NFD')}$`));

    // Stored in NFC on disk, and the decomposed spellings are gone.
    expect(result.diskRootNames).toContain(`${NFC_NOTE_BASENAME}.md`);
    expect(result.diskRootNames).toContain(NFC_FOLDER_NAME);
    expect(result.diskRootNames).not.toContain(`${NFC_NOTE_BASENAME.normalize('NFD')}.md`);
    expect(result.diskRootNames).not.toContain(NFC_FOLDER_NAME.normalize('NFD'));
    expect(result.diskFolderNames).toStrictEqual(['child.md']);

    // Still in the vault after the watcher has settled, and still readable through the moved folder.
    expect(result.isNoteInVault).toBe(true);
    expect(result.isFolderInVault).toBe(true);
    expect(result.isChildInVault).toBe(true);
    expect(result.childContent).toBe('# Child\n');
    expect(result.isLinkResolved).toBe(true);
  });
});
