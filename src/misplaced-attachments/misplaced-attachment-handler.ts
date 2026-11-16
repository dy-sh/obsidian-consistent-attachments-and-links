/**
 * @file
 *
 * The `Misplaced attachments` section of the consistency report: every reference whose target is an
 * attachment sitting outside the attachment folder configured for the note that references it.
 *
 * **It only reports.** Moving the attachment is what `collect-attachments` did, and that left for `Custom
 * Attachment Location` in 5.0.0; a user who wants the finding acted on runs that plugin's `Collect attachments`
 * or `Move attachment to proper folder`. See the scope line in `AGENTS.md`.
 *
 * **The judgement is `@mnaoumov/obsidian-lib/misplaced-attachment`'s, not this file's.** That module decides
 * whether an attachment sits in a note's folder (folder against folder, asked once per reference, folder-only,
 * for the REAL attachment) and collects the verdicts in a `MisplacedAttachmentIndex`, so `Vault Problems` and
 * this report cannot disagree. What stays here is this plugin's settings, handed to it as predicates, and the
 * rendering of the report section.
 */

import type {
  App,
  Reference,
  TFile
} from 'obsidian';

import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import { t } from '@mnaoumov/obsidian-lib/i18n/i18n';
import { generateMarkdownLink } from '@mnaoumov/obsidian-lib/link';
import {
  ExternalAttachmentLinkMode,
  MisplacedAttachmentIndex,
  recordAttachmentPlacement
} from '@mnaoumov/obsidian-lib/misplaced-attachment';
import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';

import {
  countFindings,
  formatReportCallout,
  formatReportHeading
} from '../consistency-check/report-callout.ts';
import { ReportEntryBudget } from '../consistency-check/report-entry-budget.ts';

interface MisplacedAttachmentHandlerCheckParams {
  readonly attachmentFile: TFile;
  readonly misplacedAttachments: MisplacedAttachmentCheckResult;
  readonly notePath: string;
  readonly reference: Reference;
}

interface MisplacedAttachmentHandlerConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

/**
 * The `Misplaced attachments` section of the consistency report: the library's index, rendered.
 *
 * **A reference is judged from the note that makes it (owner, 2026-09-29).** `A.md` linking
 * `!!files/B/image.png` under `./!!files/${noteFileName}` is A linking an EXTERNAL attachment, even when `B.md`
 * uses it too and it sits in B's folder. Each line names the OTHER notes that use the attachment, its proper notes
 * first. The mode is applied in `getReported`, after the whole walk, because the note that owns an attachment can
 * be walked after the note that links it from outside.
 *
 * 5.0.2 treated an attachment in ANY referencing note's folder as at home and reported none of its references.
 * The owner rejected that as the default, and it survives only as `ReportUnowned`.
 */
export class MisplacedAttachmentCheckResult extends MisplacedAttachmentIndex {
  public override toString(app: App, reportPath: string): string {
    const title = t(($) => $.misplacedAttachment.report.title);

    if (this.mode === ExternalAttachmentLinkMode.Ignore) {
      return `# ${title}\n${t(($) => $.misplacedAttachment.report.skipped)}\n\n`;
    }

    const reported = this.getReported();

    if (reported.size === 0) {
      return `# ${title}\n${t(($) => $.misplacedAttachment.report.noProblems)}\n\n`;
    }

    let $string = `${formatReportHeading(title, countFindings(reported.values()), reported.size)}\n`;
    const budget = new ReportEntryBudget();

    for (const [notePath, entries] of reported) {
      if (budget.isExhausted) {
        budget.omit(entries.length);
        continue;
      }

      const noteLink = generateNoteLink(app, reportPath, notePath);
      if (noteLink === null) {
        continue;
      }

      const lines: string[] = [];
      for (const entry of entries) {
        if (!budget.take()) {
          continue;
        }

        const attachmentLink = getFileOrNull({ app, pathOrFile: entry.attachmentPath })
          ? generateMarkdownLink({
            app,
            isEmbed: false,
            sourcePathOrFile: reportPath,
            targetPathOrFile: entry.attachmentPath
          })
          : `\`${entry.attachmentPath}\``;
        lines.push(
          `- ${t(($) => $.misplacedAttachment.report.linksToExternal, { attachmentLink, noteLink })}${this.describeOtherUsers(app, reportPath, entry.attachmentPath, notePath)}`,
          `  - ${describeReference(entry.reference)}`,
          `  - ${
            t(($) => $.misplacedAttachment.report.noteAttachmentFolder, {
              properAttachmentFolderPath: entry.properAttachmentFolderPath
            })
          }`
        );
      }

      $string += formatReportCallout(noteLink, entries.length, lines);
    }

    return `${$string}${budget.describeOmission()}`;
  }

  /**
   * The ` (also used by …)` clause, or nothing when no other note uses the attachment.
   */
  private describeOtherUsers(app: App, reportPath: string, attachmentPath: string, notePath: string): string {
    const links: string[] = [];
    for (const otherNotePath of this.getOtherUserNotePaths(attachmentPath, notePath)) {
      const link = generateNoteLink(app, reportPath, otherNotePath);
      if (link === null) {
        continue;
      }
      links.push(
        this.isProperNote(attachmentPath, otherNotePath)
          ? t(($) => $.misplacedAttachment.report.properNote, { noteLink: link })
          : link
      );
    }

    return links.length === 0 ? '' : t(($) => $.misplacedAttachment.report.alsoUsedBy, { notes: links.join(', ') });
  }
}

/**
 * Judges one already-resolved reference and records it when its target is an attachment in the wrong folder.
 */
export class MisplacedAttachmentHandler {
  private readonly app: App;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: MisplacedAttachmentHandlerConstructorParams) {
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  /**
   * The caller passes only references that RESOLVED, which is what keeps a reference already reported as a
   * bad link out of this section — the guarantee is structural rather than a second filter that could drift
   * away from the first.
   */
  public async check(params: MisplacedAttachmentHandlerCheckParams): Promise<void> {
    const {
      attachmentFile,
      misplacedAttachments,
      notePath,
      reference
    } = params;
    const settings = this.pluginSettingsComponent.settings;

    // Nothing is reported, so there is nothing to ask the attachment-path seam for.
    if (settings.externalAttachmentLinkMode === ExternalAttachmentLinkMode.Ignore) {
      return;
    }

    // A note the user declared an attachment (`.excalidraw.md` by default) IS judged; an ignored path is never
    // judged; and a shared location is anybody's folder, so no reference into it is external.
    await recordAttachmentPlacement({
      app: this.app,
      attachmentFile,
      index: misplacedAttachments,
      isPathIgnored: (path) => settings.isPathIgnored(path),
      isSharedAttachmentPath: (path) => settings.isSharedAttachmentPath(path),
      isTreatedAsAttachment: (path) => settings.isTreatedAsAttachment(path),
      notePath,
      reference
    });
  }
}
/**
 * The same per-reference line the first three buckets print, so one report does not describe a line number
 * two ways.
 */
function describeReference(reference: Reference): string {
  if (isReferenceCache(reference)) {
    return `(line ${String(reference.position.start.line + 1)}): \`${reference.link}\``;
  }

  return isFrontmatterLinkCache(reference) ? `(key ${reference.key}): \`${reference.link}\`` : `\`${reference.link}\``;
}

function generateNoteLink(app: App, reportPath: string, notePath: string): null | string {
  const note = getFileOrNull({ app, pathOrFile: notePath });
  if (!note) {
    return null;
  }

  return generateMarkdownLink({
    app,
    sourcePathOrFile: reportPath,
    targetPathOrFile: note
  });
}
