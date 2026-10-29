/**
 * @file
 *
 * `Check vault consistency` at vault scale: `@mnaoumov/obsidian-dev-toolkit`'s 37,000-note performance vault
 * plus notes that embed attachments both from their own `./!!files/<note>/` folder and from elsewhere.
 *
 * The attachment-path question is the whole cost of the check. On a scratch copy of a real 37,084-note vault the
 * check took 692 s with `Custom Attachment Location` 17.0.0 installed, 84% of it in that plugin's resolver walking
 * every link of the note to generate a NAME the report throws away, and the report asked it twice per reference.
 * So this suite pins the three things that keep the cost down, against a stand-in for that plugin's published
 * attachment-path API that counts what it is asked:
 *
 * 1. **One question per attachment reference**, never two.
 * 2. **Every question is folder-only** (`shouldSkipGeneratedAttachmentFileName`), which is what lets the real
 *    resolver skip its link walk.
 * 3. **A wall-clock bound** on the whole check, so a regression elsewhere in the walk shows up too.
 *
 * The report's own content is asserted as the control: the stand-in answers `./!!files/<note>/`, so exactly the
 * external references are named, which stops the call count passing merely because the section asked nothing.
 */

import type { Plugin } from 'obsidian';

import { waitForPerformanceVaultScan } from '@mnaoumov/obsidian-dev-toolkit/test-runners/performance-vault-scan';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  ATTACHMENT_REFERENCE_COUNT,
  EXTERNAL_ATTACHMENT_FOLDER,
  EXTERNAL_ATTACHMENT_REFERENCE_COUNT,
  PERFORMANCE_VAULT_CACHE_PATH,
  PERFORMANCE_VAULT_FILE_COUNT
} from '../../scripts/helpers/performance-vault.ts';

const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';
const CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID = 'obsidian-custom-attachment-location';
const REPORT_PATH = 'consistency-report.md';

/**
 * The check's bound. Measured after the folder-only change on the 37,084-note scratch vault, the walk alone took
 * about 11 s without `Custom Attachment Location`; a stand-in answers instantly, so this leaves room for a loaded
 * machine while still failing a return to per-reference walks, which cost minutes.
 */
const CONSISTENCY_CHECK_BUDGET_IN_MILLISECONDS = 120_000;

/**
 * How long the closure waits for the report. Under the performance project's 600 s per-eval cap, and well above
 * {@link CONSISTENCY_CHECK_BUDGET_IN_MILLISECONDS}, so a slow check fails on the budget assertion, which names the duration,
 * rather than on a wait.
 */
const REPORT_WAIT_IN_MILLISECONDS = 300_000;

const TEST_TIMEOUT_IN_MILLISECONDS = 900_000;

interface CheckResult {
  readonly callCount: number;
  readonly consistencyCheckDurationInMilliseconds: number;
  readonly flagValues: readonly unknown[];
  readonly misplacedEntryCount: number;
  readonly misplacedSectionHead: string;
}

describe('Check vault consistency at vault scale', () => {
  it('asks the attachment-path seam once per attachment reference, folder-only, within the budget', async () => {
    const vaultPath = getTemporaryVault().path;

    await waitForPerformanceVaultScan({
      cachePath: PERFORMANCE_VAULT_CACHE_PATH,
      expectedFileCount: PERFORMANCE_VAULT_FILE_COUNT,
      vaultPath
    });

    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        customAttachmentLocationPluginId,
        lib: {
          castTo,
          ComponentEx,
          publishPluginApi,
          waitUntil
        },
        reportPath,
        reportWaitInMilliseconds
      }): Promise<CheckResult> {
        interface AttachmentPathParams {
          readonly attachmentFileBaseName: string;
          readonly attachmentFileExtension: string;
          readonly notePathOrFile: NoteFileLike | null | string;
          readonly shouldSkipGeneratedAttachmentFileName?: boolean;
        }

        interface NoteFileLike {
          readonly path: string;
        }

        const MISPLACED_HEADING = '# Misplaced attachments';
        const SECTION_HEAD_LENGTH = 200;

        let callCount = 0;
        const flagValues = new Set<unknown>();
        // Unloading it revokes the stand-in API it published.
        const attachmentLocationStubOwner = new ComponentEx();

        try {
          attachmentLocationStubOwner.load();
          publishPluginApi({
            api: {
              // Synchronous on purpose: the library awaits whatever the API returns.
              getAvailablePathForAttachments: (params: AttachmentPathParams): string => {
                callCount++;
                flagValues.add(params.shouldSkipGeneratedAttachmentFileName);
                const notePath = typeof params.notePathOrFile === 'string' ? params.notePathOrFile : params.notePathOrFile?.path ?? '';
                const slashIndex = notePath.lastIndexOf('/');
                const noteFolder = slashIndex === -1 ? '' : `${notePath.slice(0, slashIndex)}/`;
                const noteBaseName = notePath.slice(slashIndex + 1).replace(/\.md$/, '');
                return `${noteFolder}!!files/${noteBaseName}/${params.attachmentFileBaseName}.${params.attachmentFileExtension}`;
              },
              isAttachmentUnitFolder: (): boolean => false
            },
            apiVersion: '1.3.0',
            component: attachmentLocationStubOwner,
            plugin: castTo<Plugin>({ manifest: { id: customAttachmentLocationPluginId } })
          });

          const existingReport = app.vault.getAbstractFileByPath(reportPath);
          if (existingReport) {
            await app.fileManager.trashFile(existingReport);
          }

          const start = performance.now();
          app.commands.executeCommandById(consistencyCommandId);
          await waitUntil({
            message: 'the consistency report was not written',
            predicate: () => Boolean(app.vault.getFileByPath(reportPath)),
            timeoutInMilliseconds: reportWaitInMilliseconds
          });
          const consistencyCheckDurationInMilliseconds = performance.now() - start;

          const reportFile = app.vault.getFileByPath(reportPath);
          const text = reportFile ? await app.vault.read(reportFile) : '';
          const headingIndex = text.indexOf(MISPLACED_HEADING);
          // The section is written last, so it runs to the end of the report.
          const section = headingIndex === -1 ? '' : text.slice(headingIndex);
          const misplacedEntryCount = section.split('\n').filter((line) => line.startsWith('- ')).length;

          return {
            callCount,
            consistencyCheckDurationInMilliseconds,
            flagValues: [...flagValues],
            misplacedEntryCount,
            misplacedSectionHead: section.slice(0, SECTION_HEAD_LENGTH)
          };
        } finally {
          attachmentLocationStubOwner.unload();
        }
      },
      input: {
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        customAttachmentLocationPluginId: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
        reportPath: REPORT_PATH,
        reportWaitInMilliseconds: REPORT_WAIT_IN_MILLISECONDS
      },
      vaultPath
    });

    console.warn('[check vault consistency at scale]', {
      callCount: result.callCount,
      consistencyCheckDurationInMilliseconds: Math.round(result.consistencyCheckDurationInMilliseconds),
      fileCount: PERFORMANCE_VAULT_FILE_COUNT,
      misplacedEntryCount: result.misplacedEntryCount
    });

    // The control: exactly the external references are named, so the seam really answered for every note.
    expect(result.misplacedSectionHead).toContain(EXTERNAL_ATTACHMENT_FOLDER);
    expect(result.misplacedEntryCount).toBe(EXTERNAL_ATTACHMENT_REFERENCE_COUNT);

    expect(result.callCount).toBe(ATTACHMENT_REFERENCE_COUNT);
    expect(result.flagValues).toEqual([true]);
    expect(result.consistencyCheckDurationInMilliseconds).toBeLessThan(CONSISTENCY_CHECK_BUDGET_IN_MILLISECONDS);
  }, TEST_TIMEOUT_IN_MILLISECONDS);
});
