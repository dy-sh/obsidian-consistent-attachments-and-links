import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { isTreatedAsAttachment } from 'obsidian-dev-utils/obsidian/file-system';
import { PathSettings } from 'obsidian-dev-utils/obsidian/path-settings';

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
  public emptyFolderBehavior: EmptyFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;

  public moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;

  public shouldAddCommandsToFileMenu = true;

  public shouldChangeNoteBacklinksDisplayText = true;

  public shouldCollectAttachmentsAutomatically = false;

  public shouldDeleteAttachmentsWithNote = false;

  public shouldDeleteExistingFilesWhenMovingNote = false;
  public shouldMoveAttachmentsWithNote = false;
  public shouldShowBackupWarning = true;
  public shouldUpdateLinks = true;
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
    this._hadDangerousSettingsReverted = this.shouldDeleteAttachmentsWithNote || this.shouldDeleteExistingFilesWhenMovingNote
      || this.shouldMoveAttachmentsWithNote
      || this.shouldCollectAttachmentsAutomatically;
    this.shouldDeleteAttachmentsWithNote = false;
    this.shouldDeleteExistingFilesWhenMovingNote = false;
    this.shouldMoveAttachmentsWithNote = false;
    this.shouldCollectAttachmentsAutomatically = false;
  }
}
