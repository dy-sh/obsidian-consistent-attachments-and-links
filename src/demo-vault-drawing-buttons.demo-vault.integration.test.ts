import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

// The button suite proves the buttons under `Try it with a drawing` in `03 Check vault consistency` run
// without an error; it cannot tell a button that does nothing from one that does what its note promises.
// This file calls the same `demoSetup.ts` helpers those buttons call, through the same `CodeScript Toolkit`
// `require`, and reads the report's `Misplaced attachments` section after each: the drawing is listed while
// `.excalidraw.md` is treated as an attachment and is gone once the setting is emptied, and the ordinary
// note beside it is listed in neither.
//
// This project seeds no harness plugin, so the closure has no `lib` and polls for itself.

interface DrawingButtonsResult {
  readonly misplacedSectionAsAttachment: string;
  readonly misplacedSectionAsNote: string;
  readonly treatAsAttachmentExtensionsAfterReset: readonly string[];
}

// What each report line names as the misplaced attachment, in either link style. `Shared target` does show up in the
// section, as a note that references the drawing; what the walkthrough promises is that it is never the attachment.
const DRAWING_AS_ATTACHMENT_PATTERN = /links to external \[{1,2}Diagram\.excalidraw/;
const SHARED_TARGET_AS_ATTACHMENT_PATTERN = /links to external \[{1,2}Shared(?: |%20)target/;

describe('demo vault drawing buttons', () => {
  it('should list the drawing as misplaced only while .excalidraw.md is treated as an attachment', async () => {
    const result = await evalInObsidian({
      async callback({ app }): Promise<DrawingButtonsResult> {
        interface DemoSetup {
          checkDrawingAsAttachment: (this: void, app: unknown) => Promise<void>;
          checkDrawingAsNote: (this: void, app: unknown) => Promise<void>;
          resetDrawingDemo: (this: void, app: unknown) => Promise<void>;
        }

        interface PluginData {
          consistencyReportFile?: string;
          treatAsAttachmentExtensions?: string[];
        }

        const PLUGIN_ID = 'consistent-attachments-and-links';
        const TIMEOUT_IN_MILLISECONDS = 20_000;
        const POLL_INTERVAL_IN_MILLISECONDS = 50;

        const deadline = Date.now() + TIMEOUT_IN_MILLISECONDS;
        while (!app.plugins.getPlugin('fix-require-modules') || !app.commands.findCommand(`${PLUGIN_ID}:check-consistency`)) {
          if (Date.now() > deadline) {
            throw new Error('CodeScript Toolkit or the check-consistency command never loaded');
          }
          await new Promise((resolve) => {
            window.setTimeout(resolve, POLL_INTERVAL_IN_MILLISECONDS);
          });
        }

        const demoSetup = window.require('/demoSetup.ts') as DemoSetup;

        async function loadData(): Promise<PluginData> {
          const data: unknown = await app.plugins.getPlugin(PLUGIN_ID)?.loadData();
          return data ?? {};
        }

        async function readMisplacedSection(): Promise<string> {
          const data = await loadData();
          const reportPath = data.consistencyReportFile ?? 'consistency-report.md';
          const report = await app.vault.adapter.read(reportPath);
          const start = report.indexOf('# Misplaced attachments');
          if (start === -1) {
            throw new Error(`${reportPath} has no Misplaced attachments section`);
          }
          const end = report.indexOf('\n# ', start + 1);
          return end === -1 ? report.slice(start) : report.slice(start, end);
        }

        await demoSetup.checkDrawingAsAttachment(app);
        const misplacedSectionAsAttachment = await readMisplacedSection();

        await demoSetup.checkDrawingAsNote(app);
        const misplacedSectionAsNote = await readMisplacedSection();

        await demoSetup.resetDrawingDemo(app);
        const dataAfterReset = await loadData();

        return {
          misplacedSectionAsAttachment,
          misplacedSectionAsNote,
          treatAsAttachmentExtensionsAfterReset: dataAfterReset.treatAsAttachmentExtensions ?? []
        };
      }
    });

    expect(result.misplacedSectionAsAttachment).toMatch(DRAWING_AS_ATTACHMENT_PATTERN);
    expect(result.misplacedSectionAsAttachment).not.toMatch(SHARED_TARGET_AS_ATTACHMENT_PATTERN);
    expect(result.misplacedSectionAsAttachment).toContain('_assets/attachments');
    expect(result.misplacedSectionAsNote).not.toMatch(DRAWING_AS_ATTACHMENT_PATTERN);
    expect(result.misplacedSectionAsNote).not.toMatch(SHARED_TARGET_AS_ATTACHMENT_PATTERN);
    expect(result.treatAsAttachmentExtensionsAfterReset).toStrictEqual(['.excalidraw.md']);
  });
});
