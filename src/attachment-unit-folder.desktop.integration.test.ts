/**
 * @file
 *
 * Desktop integration suite for the `attachmentUnitFolderPaths` setting: a designated folder is one
 * attachment, so collecting an attachment inside it must move the whole folder rather than the single
 * linked file.
 *
 * Some attachments are really a directory tree: a page saved from a browser sits next to a `_files/`
 * folder holding its images and stylesheets. Moving only the linked file leaves the rest behind and
 * the page still opens, it is simply blank — which is why the control phase is the point of this
 * test. It proves the hierarchy really is torn apart without the setting.
 *
 * obsidian-custom-attachment-location has the matching suite. Both plugins collect over the same
 * vaults, so a user with both installed must not watch one keep a folder whole while the other tears
 * it apart.
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
const COLLECT_COMMAND_ID = 'consistent-attachments-and-links:collect-attachments-in-file';

interface PhaseResult {
  readonly leftBehindPaths: readonly string[];
  readonly movedPaths: readonly string[];
}

interface ProbeResult {
  readonly control: PhaseResult;
  readonly fix: PhaseResult;
  readonly settingsFound: boolean;
}

describe('Attachment unit folders travel whole', () => {
  it('moves the entire folder with the linked attachment, and only the file without the setting', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        collectCommandId,
        lib: { waitUntil },
        pluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface UnitFolderSettings {
          attachmentUnitFolderPaths: string[];
          isAttachmentUnitFolder(path: string): boolean;
        }

        interface VaultConfigAccess {
          getConfig(key: string): unknown;
          setConfig(key: string, value: unknown): void;
        }

        function isUnitFolderSettings(value: unknown): value is UnitFolderSettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['isAttachmentUnitFolder'] === 'function';
        }

        // The plugin does not expose its settings publicly, so locate the live settings object
        // (the one the attachment collector reads) by walking the plugin's component tree.
        function findSettings(): null | UnitFolderSettings {
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
            if (isUnitFolderSettings(record['settings'])) {
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

        const EMPTY_PHASE: PhaseResult = { leftBehindPaths: [], movedPaths: [] };

        const foundSettings = findSettings();
        if (!foundSettings) {
          return { control: EMPTY_PHASE, fix: EMPTY_PHASE, settingsFound: false };
        }
        // A narrowed `const` does not stay narrowed inside a function declaration below it.
        const settings: UnitFolderSettings = foundSettings;

        const vaultUnknown: unknown = app.vault;
        const vaultConfig = vaultUnknown as VaultConfigAccess;
        const priorAttachmentFolder = vaultConfig.getConfig('attachmentFolderPath');
        const priorUnitFolderPaths = settings.attachmentUnitFolderPaths;

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        /*
         * Stages a saved-page-shaped attachment: a folder holding the linked image AND a sibling the
         * note never links to. That unlinked sibling is the whole point — it is what gets left behind
         * when only the linked file travels.
         */
        async function runPhase(shouldDesignateUnitFolder: boolean): Promise<PhaseResult> {
          const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
          const properFolder = `auf-proper-${stamp}`;
          const sourceRoot = `auf-src-${stamp}`;
          const unitFolderPath = `${sourceRoot}/page_files`;
          const linkedPath = `${unitFolderPath}/logo.png`;
          const siblingPath = `${unitFolderPath}/sub/deep.css`;
          const notePath = `auf-note-${stamp}.md`;
          const expectedPath = shouldDesignateUnitFolder ? `${properFolder}/page_files/logo.png` : `${properFolder}/logo.png`;

          try {
            vaultConfig.setConfig('attachmentFolderPath', properFolder);
            settings.attachmentUnitFolderPaths = shouldDesignateUnitFolder ? [unitFolderPath] : [];

            await app.vault.createFolder(properFolder).catch(() => undefined);
            await app.vault.createFolder(`${unitFolderPath}/sub`);
            await app.vault.createBinary(linkedPath, new ArrayBuffer(4));
            await app.vault.create(siblingPath, 'body {}');

            const note = await app.vault.create(notePath, `![[${linkedPath}]]\n`);

            await waitUntil({
              message: 'the note embed was not indexed',
              predicate: () => (app.metadataCache.getFileCache(note)?.embeds?.length ?? 0) > 0,
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            await app.workspace.getLeaf(false).openFile(note);
            app.commands.executeCommandById(collectCommandId);

            /*
             * Wait for the outcome itself rather than for the linked file merely leaving its origin.
             * That proxy is reached partway through a unit-folder move, and the next phase would then
             * rewrite the settings while this one is still running.
             */
            await waitUntil({
              message: 'the collect did not place the attachment at its expected path',
              predicate: () => Boolean(app.vault.getAbstractFileByPath(expectedPath)),
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            const paths = app.vault.getFiles().map((file) => file.path);
            return {
              leftBehindPaths: paths.filter((path) => path.startsWith(`${sourceRoot}/`)),
              movedPaths: paths.filter((path) => path.startsWith(`${properFolder}/`)).sort((a, b) => a.localeCompare(b))
            };
          } finally {
            // The desktop suite shares one vault, and the sibling suites enumerate it and assert on
            // Exactly which files survive. Take everything this phase created back out.
            const createdPaths = app.vault.getFiles().map((file) => file.path).filter((filePath) => filePath.includes(stamp)).reverse();
            for (const createdPath of createdPaths) {
              await trashIfExists(createdPath);
            }
            await trashIfExists(notePath);
            await trashIfExists(unitFolderPath);
            await trashIfExists(sourceRoot);
            await trashIfExists(properFolder);
          }
        }

        try {
          const control = await runPhase(false);
          const fix = await runPhase(true);
          return { control, fix, settingsFound: true };
        } finally {
          // eslint-disable-next-line require-atomic-updates -- Restoring a value captured before the awaits; nothing else in this vault writes it.
          settings.attachmentUnitFolderPaths = priorUnitFolderPaths;
          vaultConfig.setConfig('attachmentFolderPath', priorAttachmentFolder);
        }
      },
      input: {
        collectCommandId: COLLECT_COMMAND_ID,
        pluginId: PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.settingsFound).toBe(true);

    // Control: only the linked file travels, and the sibling it needs is stranded.
    expect(result.control.movedPaths).toHaveLength(1);
    expect(result.control.movedPaths[0]).toMatch(/\/logo\.png$/);
    expect(result.control.leftBehindPaths).toHaveLength(1);
    expect(result.control.leftBehindPaths[0]).toMatch(/\/page_files\/sub\/deep\.css$/);

    // Fix: the whole folder travels, keeping its internal shape, and nothing is stranded.
    expect(result.fix.movedPaths).toHaveLength(2);
    expect(result.fix.movedPaths[0]).toMatch(/\/page_files\/logo\.png$/);
    expect(result.fix.movedPaths[1]).toMatch(/\/page_files\/sub\/deep\.css$/);
    expect(result.fix.leftBehindPaths).toStrictEqual([]);
  }, 180_000);
});
