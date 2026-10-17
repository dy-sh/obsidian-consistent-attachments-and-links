/**
 * @file
 *
 * Regression suite for issue #121: a markdown link to a heading that contains a colon was reported as a bad
 * link, although Obsidian follows it.
 *
 * Obsidian drops the colon when it writes a link to such a heading, so the heading
 * `GQA: Training ...` is linked as `#GQA Training ...`. The check used to compare the subpath with the heading
 * text exactly, which no link Obsidian writes can satisfy. It now asks Obsidian's own `resolveSubpath`, which
 * matches the two the way Obsidian does.
 *
 * The staging is the reporter's sample vault, note for note. The control link names a heading that does not
 * exist, and it must still be reported, so the main assertion cannot pass merely because the section is empty.
 *
 * Desktop-only (the file name alone picks the project). The behavior is platform-agnostic.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';
const REPORT_PATH = 'consistency-report.md';

// The closure declares two waits, so this is charged twice against the transport's ~30 s per-closure cap.
const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

interface ProbeResult {
  /**
   * The `Bad links` section of the report, verbatim.
   */
  readonly badLinksSection: string;
}

describe('Consistency report: heading links with a colon (#121)', () => {
  it('accepts a link to a heading whose colon Obsidian dropped, and still reports a missing heading', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        lib: { waitUntil },
        reportPath,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folder = `hlc-${stamp}`;

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        try {
          await app.vault.createFolder(folder);
          await app.vault.create(
            `${folder}/20230716.md`,
            '### GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints\n\nthis is section content\n'
          );
          const linkingNote = await app.vault.create(
            `${folder}/20230813.md`,
            '\n\n[GQA](20230716.md#GQA%20Training%20Generalized%20Multi-Query%20Transformer%20Models%20from%20Multi-Head%20Checkpoints)\n\n'
              + '[Missing](20230716.md#No%20Such%20Heading)\n'
          );

          await waitUntil({
            message: 'the staged links were not indexed',
            predicate: () => (app.metadataCache.getFileCache(linkingNote)?.links?.length ?? 0) === 2,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          await trashIfExists(reportPath);
          app.commands.executeCommandById(consistencyCommandId);
          await waitUntil({
            message: 'the consistency report was not regenerated',
            predicate: () => Boolean(app.vault.getAbstractFileByPath(reportPath)),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const reportFile = app.vault.getFileByPath(reportPath);
          const text = reportFile ? await app.vault.read(reportFile) : '';
          const start = text.indexOf('# Bad links');
          const end = text.indexOf('# Bad embeds');
          return {
            badLinksSection: start === -1 ? '' : text.slice(start, end === -1 ? undefined : end)
          };
        } finally {
          await trashIfExists(folder);
          await trashIfExists(reportPath);
        }
      },
      input: {
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        reportPath: REPORT_PATH,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.badLinksSection).toContain('No Such Heading');
    expect(result.badLinksSection).not.toContain('Multi-Head Checkpoints');
  }, 180_000);
});
