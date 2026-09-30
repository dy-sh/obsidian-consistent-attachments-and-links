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
 * Three things here are easy to get wrong, and all three were. The third, an attachment shared by several
 * notes, is on {@link MisplacedAttachmentCheckResult}. The first two:
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

import { ExternalAttachmentLinkMode } from './plugin-settings.ts';

/**
 * One misplaced attachment, as one reference in one note sees it.
 *
 * The same attachment referenced from two notes is two entries, because the two notes can configure
 * different attachment folders — which is the whole reason the entry is keyed by the reference rather than
 * by the attachment. Whether an entry reaches the report is decided only once the whole vault has been
 * walked: see {@link MisplacedAttachmentCheckResult}.
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
 * A third result shape beside `ConsistencyCheckResult` and `PathCompatibilityCheckResult`: an entry carries
 * two paths — where the attachment is and where that note's configuration wants it — which a
 * `Map<string, Reference[]>` cannot express, and each line also names the OTHER notes that use the attachment.
 *
 * **A reference is judged from the note that makes it (owner, 2026-09-29).** `A.md` linking
 * `!!files/B/image.png` under `./!!files/${noteFileName}` is A linking an EXTERNAL attachment, even when `B.md`
 * uses it too and it sits in B's folder. So the map holds every such reference, and the walk also records every
 * note that uses each attachment ({@link addUser}) and the ones whose own folder holds it ({@link markHomed}) —
 * its *proper notes*. Those feed the `also used by` clause, and the `ReportUnowned` mode, which reports a
 * reference only when the attachment has no proper note. Both are known only after the whole walk, because the
 * note that owns an attachment can be walked after the note that links it from outside, so the mode is applied
 * in {@link getReported}, never inside the check.
 *
 * 5.0.2 treated an attachment in ANY referencing note's folder as at home and reported none of its references.
 * The owner rejected that as the default, and it survives only as `ReportUnowned`.
 */
export class MisplacedAttachmentCheckResult extends Map<string, MisplacedAttachmentEntry[]> {
  private readonly properNotePathsByAttachment = new Map<string, Set<string>>();
  private readonly userNotePathsByAttachment = new Map<string, Set<string>>();

  public constructor(private readonly mode = ExternalAttachmentLinkMode.Report) {
    super();
  }

  public add(notePath: string, entry: MisplacedAttachmentEntry): void {
    let entries = this.get(notePath);
    if (!entries) {
      entries = [];
      this.set(notePath, entries);
    }
    entries.push(entry);
    this.addUser(entry.attachmentPath, notePath);
  }

  /**
   * Records that a note references an attachment, wherever the attachment sits.
   *
   * @param attachmentPath - The attachment's vault-relative path.
   * @param notePath - The referencing note's vault-relative path.
   */
  public addUser(attachmentPath: string, notePath: string): void {
    addToSetMap(this.userNotePathsByAttachment, attachmentPath, notePath);
  }

  /**
   * The notes that use an attachment besides the given one, its proper notes first, each group in walk order.
   *
   * @param attachmentPath - The attachment's vault-relative path.
   * @param notePath - The note to leave out: the one whose reference is being reported.
   * @returns The other notes' paths.
   */
  public getOtherUserNotePaths(attachmentPath: string, notePath: string): string[] {
    const properNotePaths = [...this.properNotePathsByAttachment.get(attachmentPath) ?? []];
    const userNotePaths = [...this.userNotePathsByAttachment.get(attachmentPath) ?? []];
    return [...properNotePaths, ...userNotePaths.filter((path) => !properNotePaths.includes(path))].filter((path) => path !== notePath);
  }

  /**
   * The entries the report names, after the mode is applied, grouped by note, with a note left out once none of
   * its entries survive.
   *
   * @returns The entries the report names.
   */
  public getReported(): Map<string, MisplacedAttachmentEntry[]> {
    const reported = new Map<string, MisplacedAttachmentEntry[]>();
    if (this.mode === ExternalAttachmentLinkMode.Ignore) {
      return reported;
    }

    for (const [notePath, entries] of this) {
      const surviving = this.mode === ExternalAttachmentLinkMode.ReportUnowned
        ? entries.filter((entry) => !this.properNotePathsByAttachment.has(entry.attachmentPath))
        : entries;
      if (surviving.length > 0) {
        reported.set(notePath, surviving);
      }
    }
    return reported;
  }

  /**
   * Whether a note is a proper note of an attachment: it references it, and its own folder holds it.
   *
   * @param attachmentPath - The attachment's vault-relative path.
   * @param notePath - The note's vault-relative path.
   * @returns `true` when the note's own attachment folder holds the attachment.
   */
  public isProperNote(attachmentPath: string, notePath: string): boolean {
    return this.properNotePathsByAttachment.get(attachmentPath)?.has(notePath) ?? false;
  }

  /**
   * Records that an attachment sits in the folder configured for a note that references it, which makes that
   * note its proper note.
   *
   * @param attachmentPath - The attachment's vault-relative path.
   * @param notePath - The referencing note whose folder holds it.
   */
  public markHomed(attachmentPath: string, notePath: string): void {
    addToSetMap(this.properNotePathsByAttachment, attachmentPath, notePath);
    this.addUser(attachmentPath, notePath);
  }

  public override toString(app: App, reportPath: string): string {
    const title = t(($) => $.misplacedAttachment.report.title);

    if (this.mode === ExternalAttachmentLinkMode.Ignore) {
      return `# ${title}\n${t(($) => $.misplacedAttachment.report.skipped)}\n\n`;
    }

    const reported = this.getReported();

    if (reported.size === 0) {
      return `# ${title}\n${t(($) => $.misplacedAttachment.report.noProblems)}\n\n`;
    }

    let $string = `# ${title} (${String(reported.size)} files)\n`;

    for (const [notePath, entries] of reported) {
      const noteLink = generateNoteLink(app, reportPath, notePath);
      if (noteLink === null) {
        continue;
      }

      for (const entry of entries) {
        const attachmentLink = getFileOrNull({ app, pathOrFile: entry.attachmentPath })
          ? generateMarkdownLink({
            app,
            isEmbed: false,
            sourcePathOrFile: reportPath,
            targetPathOrFile: entry.attachmentPath
          })
          : `\`${entry.attachmentPath}\``;
        $string += `- ${t(($) => $.misplacedAttachment.report.linksToExternal, { attachmentLink, noteLink })}${this.describeOtherUsers(app, reportPath, entry.attachmentPath, notePath)}\n`;
        $string += `  - ${describeReference(entry.reference)}\n`;
        $string += `  - ${
          t(($) => $.misplacedAttachment.report.noteAttachmentFolder, {
            properAttachmentFolderPath: entry.properAttachmentFolderPath
          })
        }\n`;
      }

      $string += '\n';
    }

    return `${$string}\n`;
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

    // A note is not an attachment — unless the user declared its extension one (`.excalidraw.md` by
    // default), in which case it IS judged here. That is the same rule a collector uses to make such a file
    // travel as an attachment, and answering differently would leave the report and the repair disagreeing
    // about what an attachment is.
    if (isNote(attachmentFile) && !settings.isTreatedAsAttachment(attachmentFile.path)) {
      return;
    }

    if (settings.isPathIgnored(attachmentFile.path)) {
      return;
    }

    // A shared location is anybody's folder, so no reference into it is external.
    if (settings.isSharedAttachmentPath(attachmentFile.path)) {
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
      misplacedAttachments.markHomed(attachmentFile.path, notePath);
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
      misplacedAttachments.markHomed(attachmentFile.path, notePath);
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

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set<string>();
    map.set(key, set);
  }
  set.add(value);
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
