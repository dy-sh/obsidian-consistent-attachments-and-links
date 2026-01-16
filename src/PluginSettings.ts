import { PathSettings } from 'obsidian-dev-utils/obsidian/Plugin/PathSettings';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';

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

  public moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode =
    MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;

  public shouldChangeNoteBacklinksDisplayText = true;

  public shouldCollectAttachmentsAutomatically = false;

  public shouldDeleteAttachmentsWithNote = false;

  public shouldDeleteExistingFilesWhenMovingNote = false;
  public shouldMoveAttachmentsWithNote = false;
  public shouldShowBackupWarning = true;
  public shouldUpdateLinks = true;
  public treatAsAttachmentExtensions: readonly string[] = ['.excalidraw.md'];

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

  private _hadDangerousSettingsReverted = false;

  private readonly _pathSettings = new PathSettings();

  public isExcludedFromAttachmentCollecting(path: string): boolean {
    return this._attachmentCollectingPaths.isPathIgnored(path);
  }

  public isPathIgnored(path: string): boolean {
    return this._pathSettings.isPathIgnored(path);
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
