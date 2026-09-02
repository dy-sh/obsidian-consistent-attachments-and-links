import { isTreatedAsAttachment } from 'obsidian-dev-utils/obsidian/file-system';
import { PathSettings } from 'obsidian-dev-utils/obsidian/path-settings';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

export enum CollectAttachmentUsedByMultipleNotesMode {
  Cancel = 'Cancel',
  Copy = 'Copy',
  Move = 'Move',
  Prompt = 'Prompt',
  Skip = 'Skip'
}

export enum MoveAttachmentToProperFolderUsedByMultipleNotesMode {
  Cancel = 'Cancel',
  CopyAll = 'CopyAll',
  Prompt = 'Prompt',
  Skip = 'Skip'
}

export class PluginSettings {
  public collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Skip;
  public consistencyReportFile = 'consistency-report.md';

  /**
   * Whether the user has already declined the suggestion to install Advanced Rename and Delete Handler.
   *
   * Only the load-time notice honours it — the settings-tab banner is shown regardless, because a user
   * looking at these settings right now is a fresher signal than an answer they gave earlier.
   */
  public isAdvancedRenameAndDeleteHandlerSuggestionDeclined = false;

  public moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;

  /**
   * The rename/delete values this plugin used to own, waiting to be offered to Advanced Rename and Delete
   * Handler. Non-`null` means an offer is still pending; `null` means there is nothing to offer, which is
   * also what a fresh install has.
   *
   * One nullable object rather than one pending property per setting, so a fresh install can never be told
   * it has a migration waiting and an applied migration is retired with a single write.
   */
  public proposedRenameDeleteSettings: MigratableSettings | null = null;

  public shouldAddCommandsToFileMenu = true;

  public shouldCollectAttachmentsAutomatically = false;

  public shouldShowBackupWarning = true;
  public treatAsAttachmentExtensions: readonly string[] = ['.excalidraw.md'];

  /**
   * Folders whose whole hierarchy travels as one attachment.
   *
   * Same vocabulary as the include / exclude path settings: a plain entry is a path from the vault
   * root, and an entry wrapped in `/` is a regular expression. Matching a folder *name* wherever it
   * appears therefore needs the regular-expression form, e.g. `/(^|\/)[^/]+_files(\/|$)/`.
   */
  public get attachmentUnitFolderPaths(): string[] {
    return this._attachmentUnitFolderPaths.excludePaths;
  }

  public set attachmentUnitFolderPaths(value: string[]) {
    this._attachmentUnitFolderPaths.excludePaths = value;
  }

  public get excludePaths(): string[] {
    return this._pathSettings.excludePaths;
  }

  public set excludePaths(value: string[]) {
    this._pathSettings.excludePaths = value;
  }

  public get excludePathsFromAttachmentCollecting(): string[] {
    return this._attachmentCollectingPaths.excludePaths;
  }

  public set excludePathsFromAttachmentCollecting(value: string[]) {
    this._attachmentCollectingPaths.excludePaths = value;
  }

  public get hadDangerousSettingsReverted(): boolean {
    return this._hadDangerousSettingsReverted;
  }

  public get includePaths(): string[] {
    return this._pathSettings.includePaths;
  }

  public set includePaths(value: string[]) {
    this._pathSettings.includePaths = value;
  }

  private readonly _attachmentCollectingPaths = new PathSettings();

  // Only the exclude half is exposed: `isPathIgnored` then reduces to "matches one of these
  // Patterns", which is what a designation list needs. Same shape as `_attachmentCollectingPaths`.
  private readonly _attachmentUnitFolderPaths = new PathSettings();

  private _hadDangerousSettingsReverted = false;

  private readonly _pathSettings = new PathSettings();

  public isAttachmentUnitFolder(path: string): boolean {
    return this._attachmentUnitFolderPaths.isPathIgnored(path);
  }

  public isExcludedFromAttachmentCollecting(path: string): boolean {
    return this._attachmentCollectingPaths.isPathIgnored(path);
  }

  public isPathIgnored(path: string): boolean {
    return this._pathSettings.isPathIgnored(path);
  }

  public isTreatedAsAttachment(path: string): boolean {
    return isTreatedAsAttachment({
      attachmentExtensions: this.treatAsAttachmentExtensions,
      pathOrFile: path
    });
  }

  public revertDangerousSettings(): void {
    if (!this.shouldShowBackupWarning) {
      return;
    }
    // Three of the four settings this used to revert moved to Advanced Rename and Delete Handler in 4.0.0,
    // Which reverts its own. Auto-collecting is the one destructive setting still owned here.
    this._hadDangerousSettingsReverted = this.shouldCollectAttachmentsAutomatically;
    this.shouldCollectAttachmentsAutomatically = false;
  }
}
