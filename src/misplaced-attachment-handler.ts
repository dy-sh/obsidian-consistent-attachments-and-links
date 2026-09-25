/**
 * @file
 *
 * The `Misplaced attachments` section of the consistency report: every reference whose target is an
 * attachment sitting outside the attachment folder configured for the note that references it.
 *
 * **It only reports.** Moving the attachment is what `collect-attachments` did, and that left for Custom
 * Attachment Location in 5.0.0; a user who wants the finding acted on runs that plugin's `Collect attachments`
 * or `Move attachment to proper folder`. See the scope line in `AGENTS.md`.
 *
 * Two things here are easy to get wrong, and both were:
 *
 * - **The judgement is about the FOLDER, not the path.** obsidian-dev-utils' `getAttachmentFilePath`
 *   answers about the proper *path* — folder and templated base name both — so judging on it raw reports
 *   every attachment whose NAME does not match the rename template. That is a different defect, this plugin
 *   does not offer to fix it, and reporting what we do not repair is the mistake the wikilink buckets'
 *   removal already settled. So the comparison is `dirname` against `dirname`.
 * - **The proper path is asked for the REAL attachment, never a dummy.** An attachment folder template may
 *   depend on the attachment's own name, extension or stats, so `getAttachmentFolderPath`'s dummy-file
 *   route can answer about a file that does not exist. Asking the same question, the same way, as Custom
 *   Attachment Location's `Move attachment to proper folder` is also what keeps the report and the repair
 *   from disagreeing.
 *
 * The Custom Attachment Location seam needs no code here. Every proper-path read goes through
 * obsidian-dev-utils' `getAttachmentFilePath`, which dispatches to `app.vault.getAvailablePathForAttachments.extended`
 * when a plugin has installed one and falls back to Obsidian's own three modes when none has. That function
 * takes the note path as an argument, so there is no ambient current-file state for a vault-wide walk to
 * leak — which is what makes an audit over every note answerable at all.
 */

import type {
  App,
  Reference,
  TFile
} from 'obsidian';

import {
  getDataAdapterEx,
  isFrontmatterLinkCache,
  isReferenceCache,
  parentFolderPath
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  AttachmentPathContext,
  getAttachmentFilePath,
  isAtProperAttachmentPath
} from 'obsidian-dev-utils/obsidian/attachment-path';
import {
  getFileOrNull,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { generateMarkdownLink } from 'obsidian-dev-utils/obsidian/link';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

/**
 * One misplaced attachment, as one reference in one note sees it.
 *
 * The same attachment referenced from two notes is two entries, because the two notes can configure
 * different attachment folders — which is the whole reason the entry is keyed by the reference rather than
 * by the attachment.
 */
export interface MisplacedAttachmentEntry {
  /**
   * The attachment's current vault-relative path.
   */
  readonly attachmentPath: string;

  /**
   * The vault-relative folder the referencing note's configuration puts its attachments in.
   */
  readonly properAttachmentFolderPath: string;

  /**
   * The reference that reaches it, so the report can name the line or the frontmatter key.
   */
  readonly reference: Reference;
}

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
 * The `Misplaced attachments` section of the consistency report.
 *
 * A third result shape beside `ConsistencyCheckResult` and `PathCompatibilityCheckResult`: it is
 * grouped by note like the first, because the finding is about a note's references, but an entry carries
 * two paths — where the attachment is and where that note's configuration wants it — which a
 * `Map<string, Reference[]>` cannot express.
 */
export class MisplacedAttachmentCheckResult extends Map<string, MisplacedAttachmentEntry[]> {
  public add(notePath: string, entry: MisplacedAttachmentEntry): void {
    let entries = this.get(notePath);
    if (!entries) {
      entries = [];
      this.set(notePath, entries);
    }
    entries.push(entry);
  }

  public override toString(app: App, reportPath: string): string {
    const title = t(($) => $.misplacedAttachment.report.title);

    if (this.size === 0) {
      return `# ${title}\n${t(($) => $.misplacedAttachment.report.noProblems)}\n\n`;
    }

    let $string = `# ${title} (${String(this.size)} files)\n`;

    for (const [notePath, entries] of this) {
      const note = getFileOrNull({ app, pathOrFile: notePath });
      if (!note) {
        continue;
      }

      const linkString = generateMarkdownLink({
        app,
        sourcePathOrFile: reportPath,
        targetPathOrFile: note
      });
      $string += `${linkString}:\n`;

      for (const entry of entries) {
        $string += `- ${describeReference(entry.reference)}\n`;
        $string += `  - ${
          t(($) => $.misplacedAttachment.report.shouldBeIn, {
            attachmentPath: entry.attachmentPath,
            properAttachmentFolderPath: entry.properAttachmentFolderPath
          })
        }\n`;
      }

      $string += '\n\n';
    }

    return $string;
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

    // A note is not an attachment — unless the user declared its extension one (`.excalidraw.md` by
    // default), in which case it IS judged here. That is the same rule a collector uses to make such a file
    // travel as an attachment, and answering differently would leave the report and the repair disagreeing
    // about what an attachment is.
    if (isNote(attachmentFile) && !this.pluginSettingsComponent.settings.isTreatedAsAttachment(attachmentFile.path)) {
      return;
    }

    if (this.pluginSettingsComponent.settings.isPathIgnored(attachmentFile.path)) {
      return;
    }

    // Already at its proper path, name and all — or at that path plus an Obsidian deduplication suffix, parked
    // there because a different file holds the suffix-free slot. Either way nothing would move it.
    if (
      await isAtProperAttachmentPath({
        app: this.app,
        attachmentPathOrFile: attachmentFile,
        context: AttachmentPathContext.Unknown,
        notePathOrFile: notePath
      })
    ) {
      return;
    }

    const properAttachmentPath = await getAttachmentFilePath({
      app: this.app,
      context: AttachmentPathContext.Unknown,
      notePathOrFile: notePath,
      oldAttachmentPathOrFile: attachmentFile,
      shouldSkipDuplicateCheck: true
    });

    // `parentFolderPath`, not `dirname`: it answers `/` for the vault root where `dirname` answers `.`, and
    // it is what obsidian-dev-utils' own `getAttachmentFolderPath` returns — so the folder this report names
    // is byte-identical to the one that function would give for the same note.
    const properAttachmentFolderPath = parentFolderPath(properAttachmentPath);

    // Fold exactly as obsidian-dev-utils' `isAtProperAttachmentPath` does, so a case-insensitive adapter
    // does not make this section report a folder the collector considers a match.
    const isInsensitive = getDataAdapterEx(this.app).insensitive;

    // Only the base name differs: the attachment IS in its configured folder, and renaming it is not this
    // plugin's to report.
    if (fold(parentFolderPath(attachmentFile.path)) === fold(properAttachmentFolderPath)) {
      return;
    }

    misplacedAttachments.add(notePath, {
      attachmentPath: attachmentFile.path,
      properAttachmentFolderPath,
      reference
    });

    function fold(value: string): string {
      return isInsensitive ? value.toLowerCase() : value;
    }
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
