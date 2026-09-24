/**
 * @file
 *
 * Desktop integration suite for the consistency report's `Misplaced attachments` section: the fifth bucket
 * names every note whose reference reaches an attachment sitting outside the attachment folder configured
 * for THAT note.
 *
 * **The per-note half is the whole point, and it is what a unit suite cannot prove.** The section's original
 * brief assumed the only readable answer was `app.vault.getConfig('attachmentFolderPath')`, which Custom
 * Attachment Location patches against the CURRENTLY OPEN file — so a vault-wide walk would have given every
 * note the active note's folder, silently and with no error. That is not how the answer is obtained:
 * obsidian-dev-utils' `getAttachmentFilePath` dispatches to `app.vault.getAvailablePathForAttachments.extended`,
 * a function a plugin installs and which takes the NOTE PATH as an argument. Phase 2 below installs one of
 * its own that answers a different folder per note and asserts the report names both — the falsifying test
 * for the ambient-state failure, run with nothing installed.
 *
 * That is also why this suite needs no released Custom Attachment Location and no API stub: the seam is a
 * property on `app.vault.getAvailablePathForAttachments`, not a registry lookup.
 *
 * The three phases share one staging, changing only the answer to *where should this attachment be?*:
 *
 * 1. **No extended function** — Obsidian's own `attachmentFolderPath`. The attachment is elsewhere, so both
 *    notes are reported against that one folder.
 * 2. **An extended function, per note** — two notes, two different proper folders, one attachment. Proves
 *    the walk asks per note rather than once.
 * 3. **Configured folder = where the attachment already is** — the control. Nothing is reported, which is
 *    what stops phases 1 and 2 passing merely because the section names everything it sees.
 *
 * Desktop-only (the file name alone picks the project). The behavior is platform-agnostic; this can become
 * `*.cross-platform.integration.test.ts` once an Android leg is worth its runtime.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';
const PLUGIN_ID = 'consistent-attachments-and-links';

/*
 * Under the transport's ~30 s per-closure cap, not at it.
 * The closure declares FOUR waits in total - one for the two staged notes to be indexed, then one per
 * phase for the regenerated report - so this constant is charged four times: 20 000 ms of the 30 000 the
 * transport allows. Counting the waits rather than the call sites is the arithmetic that matters; a closure
 * over the cap can only die as a bare transport timeout naming the harness instead of the wait that overran.
 * Indexing two staged notes and writing one report both land well under a second, so the smaller ceiling
 * costs nothing and a stall fails with the message that names it.
 * The constant feeds nothing but the closure's own input, so no Node-side wait sees it.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

interface PhaseResult {
  /**
   * The `Misplaced attachments` section of the report, verbatim.
   */
  readonly section: string;
}

interface ProbeResult {
  readonly attachmentPath: string;
  readonly hasExtendedFunction: boolean;
  readonly inPlace: PhaseResult;
  readonly noteOnePath: string;
  readonly noteTwoPath: string;
  readonly perNote: PhaseResult;
  readonly properFolder: string;
  readonly reportPath: string;
  readonly vaultDefault: PhaseResult;
}

describe('Consistency report: misplaced attachments', () => {
  it('names the proper folder per referencing note, and stays silent when the attachment is already there', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        lib: { waitUntil },
        pluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface ExtendedHolder {
          extended?: unknown;
        }

        interface ExtendedParams {
          readonly attachmentFileBaseName: string;
          readonly attachmentFileExtension: string;
          readonly notePathOrFile: NoteFileLike | string;
        }

        interface NoteFileLike {
          readonly path: string;
        }

        interface ReportSettings {
          consistencyReportFile: string;
        }

        interface VaultConfigAccess {
          getConfig: (key: string) => unknown;
          setConfig: (key: string, value: unknown) => void;
        }

        function isReportSettings(value: unknown): value is ReportSettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['consistencyReportFile'] === 'string';
        }

        // The plugin does not expose its settings publicly, so locate the live settings object by walking
        // The plugin's component tree — the same approach the attachment-unit-folder suite takes.
        function findSettings(): null | ReportSettings {
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
            if (isReportSettings(record['settings'])) {
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

        const MISPLACED_HEADING = '# Misplaced attachments';
        const EMPTY_PHASE: PhaseResult = { section: '' };

        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const attachmentFolder = `mar-where-${stamp}`;
        const attachmentPath = `${attachmentFolder}/img.png`;
        const noteOnePath = `mar-one-${stamp}.md`;
        const noteTwoPath = `mar-two-${stamp}.md`;
        const extendedRoot = `mar-extended-${stamp}`;
        const properFolder = `mar-proper-${stamp}`;

        const settings = findSettings();
        const reportPath = settings?.consistencyReportFile ?? 'consistency-report.md';

        const vaultUnknown: unknown = app.vault;
        const vaultConfig = vaultUnknown as VaultConfigAccess;
        const priorAttachmentFolder = vaultConfig.getConfig('attachmentFolderPath');
        const availablePathFunctionUnknown: unknown = app.vault.getAvailablePathForAttachments;
        const availablePathFunction = availablePathFunctionUnknown as ExtendedHolder;
        const priorExtended = availablePathFunction.extended;

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        /**
         * Regenerates the report from scratch and hands back only its last section. The old report is taken
         * out first so the wait below cannot be satisfied by the PREVIOUS phase's file — the whole reason
         * each phase reads a fresh one.
         */
        async function runPhase(): Promise<PhaseResult> {
          await trashIfExists(reportPath);

          app.commands.executeCommandById(consistencyCommandId);

          await waitUntil({
            message: 'the consistency report was not regenerated',
            predicate: () => Boolean(app.vault.getAbstractFileByPath(reportPath)),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const reportFile = app.vault.getFileByPath(reportPath);
          if (!reportFile) {
            return EMPTY_PHASE;
          }

          const text = await app.vault.read(reportFile);
          const headingIndex = text.indexOf(MISPLACED_HEADING);
          // The section is written last, so it runs to the end of the report.
          return { section: headingIndex === -1 ? '' : text.slice(headingIndex) };
        }

        try {
          await app.vault.createFolder(attachmentFolder);
          await app.vault.createBinary(attachmentPath, new ArrayBuffer(4));
          const noteOne = await app.vault.create(noteOnePath, `![[${attachmentPath}]]\n`);
          const noteTwo = await app.vault.create(noteTwoPath, `![[${attachmentPath}]]\n`);

          await waitUntil({
            message: 'the staged embeds were not indexed',
            predicate: () =>
              (app.metadataCache.getFileCache(noteOne)?.embeds?.length ?? 0) > 0
              && (app.metadataCache.getFileCache(noteTwo)?.embeds?.length ?? 0) > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          // Phase 1 — Obsidian's own setting, no plugin in the way.
          vaultConfig.setConfig('attachmentFolderPath', properFolder);
          const vaultDefault = await runPhase();

          /*
           * Phase 2 — the seam Custom Attachment Location uses. The answer depends only on the NOTE passed
           * in, so if the walk asked once (or asked about the active file), both notes would come back with
           * the same folder and the assertions below would fail.
           */
          availablePathFunction.extended = (params: ExtendedParams): Promise<string> => {
            const notePath = typeof params.notePathOrFile === 'string' ? params.notePathOrFile : params.notePathOrFile.path;
            const noteBaseName = (notePath.split('/').pop() ?? '').replace(/\.md$/, '');
            return Promise.resolve(`${extendedRoot}/${noteBaseName}/${params.attachmentFileBaseName}.${params.attachmentFileExtension}`);
          };
          const hasExtendedFunction = typeof availablePathFunction.extended === 'function';
          const perNote = await runPhase();
          availablePathFunction.extended = priorExtended;

          // Phase 3 — the control: the attachment is already in the configured folder.
          vaultConfig.setConfig('attachmentFolderPath', attachmentFolder);
          const inPlace = await runPhase();

          return {
            attachmentPath,
            hasExtendedFunction,
            inPlace,
            noteOnePath,
            noteTwoPath,
            perNote,
            properFolder,
            reportPath,
            vaultDefault
          };
        } finally {
          // Restoring values captured before the awaits; nothing else in this vault writes them.
          availablePathFunction.extended = priorExtended;
          vaultConfig.setConfig('attachmentFolderPath', priorAttachmentFolder);

          // The desktop suite shares one vault and sibling suites assert on exactly which files survive.
          const createdPaths = app.vault.getFiles().map((file) => file.path).filter((filePath) => filePath.includes(stamp)).reverse();
          for (const createdPath of createdPaths) {
            await trashIfExists(createdPath);
          }
          await trashIfExists(attachmentFolder);
          await trashIfExists(properFolder);
          await trashIfExists(reportPath);
        }
      },
      input: {
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        pluginId: PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.hasExtendedFunction).toBe(true);

    // Phase 1: both notes reported, against Obsidian's own configured folder.
    expect(result.vaultDefault.section).toContain(result.attachmentPath);
    expect(result.vaultDefault.section).toContain(`should be in \`${result.properFolder}\``);
    expect(result.vaultDefault.section).toContain(result.noteOnePath.replace(/\.md$/, ''));
    expect(result.vaultDefault.section).toContain(result.noteTwoPath.replace(/\.md$/, ''));

    /*
     * Phase 2: ONE attachment, TWO notes, TWO different proper folders. This is the assertion that fails if
     * the walk ever goes back to asking about the active file instead of the note in hand.
     */
    const noteOneBaseName = result.noteOnePath.replace(/\.md$/, '');
    const noteTwoBaseName = result.noteTwoPath.replace(/\.md$/, '');
    expect(result.perNote.section).toContain('should be in `mar-extended-');
    expect(result.perNote.section).toContain(`/${noteOneBaseName}\``);
    expect(result.perNote.section).toContain(`/${noteTwoBaseName}\``);

    // Phase 3, the control: the attachment is where the configuration wants it, so it is not named at all.
    expect(result.inPlace.section).toContain('# Misplaced attachments');
    expect(result.inPlace.section).not.toContain(result.attachmentPath);
  }, 180_000);
});
