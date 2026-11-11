/**
 * @file
 *
 * The consistency report groups each note's findings in one collapsed callout. This suite checks what only a
 * real Obsidian can: that the callout renders collapsed, with its findings hidden, and that the note link in
 * its title is an internal link that opens the note. It renders the report with Obsidian's own Markdown renderer\n * and opens the title link's text from the report, which is what a click on it does.
 *
 * The note has two bad links, so the callout's count is `(2)` and a callout-per-finding regression would show as
 * two callouts.
 *
 * Desktop-only (the file name alone picks the project). The rendering is platform-agnostic.
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

// The closure declares two waits, so this is charged twice against the transport's ~30 s cap.
const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

interface ProbeResult {
  readonly activeFilePathAfterOpen: null | string;
  readonly calloutCount: number;
  readonly calloutTitle: string;
  readonly isCollapsed: boolean;
  readonly isContentHidden: boolean;
  readonly linkHref: null | string;
  readonly notePath: string;
  readonly reportText: string;
}

describe('Consistency report: one collapsed callout per note', () => {
  it('renders the note collapsed, with its count, and its title link opens the note', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        consistencyCommandId,
        lib: { waitUntil },
        obsidianModule,
        reportPath,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folder = `rc-${stamp}`;
        const notePath = `${folder}/Callout probe ${stamp}.md`;

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        try {
          await app.vault.createFolder(folder);
          const note = await app.vault.create(notePath, '[One](nowhere-one.md)\n\n[Two](nowhere-two.md)\n');

          await waitUntil({
            message: 'the staged links were not indexed',
            predicate: () => (app.metadataCache.getFileCache(note)?.links?.length ?? 0) === 2,
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
          if (!reportFile) {
            throw new Error('The report was not written');
          }
          const reportText = await app.vault.read(reportFile);

          /*
           * Rendered through Obsidian's own Markdown renderer into an attached element, not through a reading view:
           * the test window is never shown, and reading view renders a section only once it scrolls into sight, so a
           * leaf's preview stays empty here (measured: an empty `markdown-preview-sizer`, even after a forced rerender).
           */
          const component = new obsidianModule.Component();
          component.load();
          const host = activeDocument.body.createDiv();
          try {
            await obsidianModule.MarkdownRenderer.render(app, reportText, host, reportPath, component);
            const callouts = [...host.querySelectorAll<HTMLElement>('.callout')].filter((callout) => callout.querySelector(`.callout-title a.internal-link[data-href*="${CSS.escape(stamp)}"]`) !== null);
            const callout = callouts[0];
            if (!callout) {
              throw new Error(`The probe note callout was not rendered: ${host.innerHTML.slice(0, 3000)}`);
            }
            const content = callout.querySelector<HTMLElement>('.callout-content');
            const linkHref = callout.querySelector<HTMLElement>(':scope .callout-title a.internal-link')?.dataset['href'] ?? null;

            // What a click on the title link does: open its link text from the report.
            await app.workspace.openLinkText(linkHref ?? '', reportPath);

            return {
              activeFilePathAfterOpen: app.workspace.getActiveFile()?.path ?? null,
              calloutCount: callouts.length,
              calloutTitle: callout.querySelector('.callout-title')?.textContent ?? '',
              isCollapsed: callout.classList.contains('is-collapsed'),
              isContentHidden: content === null || getComputedStyle(content).display === 'none',
              linkHref,
              notePath,
              reportText
            };
          } finally {
            host.remove();
            component.unload();
          }
        } finally {
          for (const leaf of app.workspace.getLeavesOfType('markdown')) {
            leaf.detach();
          }
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

    expect(result.reportText).toMatch(/^# Bad links \(\d+ in \d+ notes\)$/mu);
    expect(result.reportText).toMatch(/^> \[!warning\]- .*Callout.*probe.* \(2\)$/mu);
    expect(result.calloutCount).toBe(1);
    expect(result.calloutTitle).toContain('(2)');
    expect(result.isCollapsed).toBe(true);
    expect(result.isContentHidden).toBe(true);
    expect(result.linkHref).toContain('Callout probe');
    expect(result.activeFilePathAfterOpen).toBe(result.notePath);
  }, 180_000);
});
