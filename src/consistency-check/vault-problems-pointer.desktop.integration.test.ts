/**
 * @file
 *
 * With `Vault Problems` enabled, `Check vault consistency` still writes the report, opens it with a line pointing to
 * that plugin's live view, and shows a notice whose `Open Problems` button runs that plugin's command.
 *
 * `Vault Problems` is not installed here. The pointer reads only two things of it, both registry records rather
 * than code: its id in `app.plugins.enabledPlugins`, and its `open-problems` command. So the closure marks the id
 * enabled in memory and registers a stand-in command under the real id that records being run, then puts both
 * back. A second run with the id cleared is the control: no pointer and no notice.
 *
 * Desktop-only (the file name alone picks the project): the trusted click goes through Electron.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const CONSISTENCY_COMMAND_ID = 'consistent-attachments-and-links:check-consistency';
const OPEN_PROBLEMS_COMMAND_ID = 'vault-problems:open-problems';
const REPORT_PATH = 'consistency-report.md';
const VAULT_PROBLEMS_PLUGIN_ID = 'vault-problems';

// The closure declares seven waits, so this is charged seven times against the transport's ~30 s cap.
const WAIT_TIMEOUT_IN_MILLISECONDS = 4000;

interface ProbeResult {
  readonly controlNoticeCount: number;
  readonly controlReportText: string;
  readonly noticeButtonText: string;
  readonly noticeText: string;
  readonly openProblemsRunCount: number;
  readonly reportText: string;
}

describe('Consistency report: pointer to Vault Problems', () => {
  it('writes the report with a pointer line, and its notice button runs the Open Problems command', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        lib: { clickElement, waitUntil },
        openProblemsCommandId,
        reportPath,
        vaultProblemsPluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        let openProblemsRunCount = 0;

        function findPointerNotices(): HTMLElement[] {
          return [...document.querySelectorAll<HTMLElement>('.notice')].filter((notice) => [...notice.querySelectorAll('code')].some((code) => code.textContent === 'Vault Problems'));
        }

        async function trashReport(): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(reportPath);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        async function runCheck(): Promise<string> {
          await trashReport();
          app.commands.executeCommandById(consistencyCommandId);
          await waitUntil({
            message: 'the consistency report was not regenerated',
            predicate: () => Boolean(app.vault.getAbstractFileByPath(reportPath)),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          const reportFile = app.vault.getFileByPath(reportPath);
          if (!reportFile) {
            throw new Error('The report was not written');
          }
          return await app.vault.read(reportFile);
        }

        // A trusted click lands on whatever is on top, and this plugin's one-time backup warning is a dialog over the
        // whole window until someone closes it.
        async function dismissDialogs(): Promise<void> {
          await waitUntil({
            message: 'a dialog stayed open over the window',
            predicate: async () => {
              const buttons = [...document.querySelectorAll<HTMLElement>('.modal-container button.mod-cta, .modal-container .modal-close-button')];
              const button = buttons.at(-1);
              if (!button) {
                return true;
              }
              await clickElement({ element: button });
              return false;
            },
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
        }

        for (const notice of findPointerNotices()) {
          notice.remove();
        }

        const wasEnabled = app.plugins.enabledPlugins.has(vaultProblemsPluginId);
        app.plugins.enabledPlugins.add(vaultProblemsPluginId);
        app.commands.addCommand({
          callback: () => {
            openProblemsRunCount++;
          },
          id: openProblemsCommandId,
          name: 'Vault Problems: Open Problems'
        });

        try {
          await dismissDialogs();
          const reportText = await runCheck();

          await waitUntil({
            message: 'the Vault Problems notice did not appear',
            predicate: () => findPointerNotices().length > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          const notice = findPointerNotices()[0];
          const button = notice?.querySelector('button');
          if (!notice || !button) {
            throw new Error('The notice has no button');
          }
          const noticeText = notice.textContent;
          const noticeButtonText = button.textContent;

          await dismissDialogs();
          // A notice slides in, so a trusted click sent the moment it appears lands where the button is not yet.
          await waitUntil({
            message: 'the notice button never became the element under its own centre',
            predicate: () => {
              const rect = button.getBoundingClientRect();
              return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === button;
            },
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
          await clickElement({ element: button });
          await waitUntil({
            message: 'the Open Problems command did not run',
            predicate: () => openProblemsRunCount > 0,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          for (const staleNotice of findPointerNotices()) {
            staleNotice.remove();
          }

          // The control: the same run with the plugin not enabled.
          app.plugins.enabledPlugins.delete(vaultProblemsPluginId);
          const controlReportText = await runCheck();

          return {
            controlNoticeCount: findPointerNotices().length,
            controlReportText,
            noticeButtonText,
            noticeText,
            openProblemsRunCount,
            reportText
          };
        } finally {
          app.commands.removeCommand(openProblemsCommandId);
          if (wasEnabled) {
            app.plugins.enabledPlugins.add(vaultProblemsPluginId);
          } else {
            app.plugins.enabledPlugins.delete(vaultProblemsPluginId);
          }
          for (const leaf of app.workspace.getLeavesOfType('markdown')) {
            leaf.detach();
          }
          await trashReport();
        }
      },
      input: {
        consistencyCommandId: CONSISTENCY_COMMAND_ID,
        openProblemsCommandId: OPEN_PROBLEMS_COMMAND_ID,
        reportPath: REPORT_PATH,
        vaultProblemsPluginId: VAULT_PROBLEMS_PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    expect(result.reportText.startsWith('> [!TIP]\n> `Vault Problems` shows these problems live')).toBe(true);
    expect(result.reportText).toMatch(/^# Bad links/mu);
    expect(result.noticeText).toContain('Vault Problems shows these problems live, as you edit, with quick fixes.');
    expect(result.noticeButtonText).toBe('Open Problems');
    expect(result.openProblemsRunCount).toBe(1);
    expect(result.controlReportText).not.toContain('Vault Problems');
    expect(result.controlNoticeCount).toBe(0);
  }, 180_000);
});
