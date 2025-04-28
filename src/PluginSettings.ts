import { EmptyAttachmentFolderBehavior } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { escapeRegExp } from 'obsidian-dev-utils/RegExp';

const ALWAYS_MATCH_REG_EXP = /(?:)/;
const NEVER_MATCH_REG_EXP = /$./;

export class PluginSettings {
  public consistencyReportFile = 'consistency-report.md';
  public emptyAttachmentFolderBehavior: EmptyAttachmentFolderBehavior = EmptyAttachmentFolderBehavior.DeleteWithEmptyParents;
  public shouldChangeNoteBacklinksDisplayText = true;
  public shouldCollectAttachmentsAutomatically = false;
  public shouldDeleteAttachmentsWithNote = false;
  public shouldDeleteExistingFilesWhenMovingNote = false;
  public shouldMoveAttachmentsWithNote = false;
  public shouldShowBackupWarning = true;
  public shouldUpdateLinks = true;
  public treatAsAttachmentExtensions: readonly string[] = ['.excalidraw.md'];

  public get excludePaths(): string[] {
    return this._excludePaths;
  }

  public set excludePaths(value: string[]) {
    this._excludePaths = value.filter(Boolean);
    this._excludePathsRegExp = makeRegExp(this._excludePaths, NEVER_MATCH_REG_EXP);
  }

  public get hadDangerousSettingsReverted(): boolean {
    return this._hadDangerousSettingsReverted;
  }

  public get includePaths(): string[] {
    return this._includePaths;
  }

  public set includePaths(value: string[]) {
    this._includePaths = value.filter(Boolean);
    this._includePathsRegExp = makeRegExp(this._includePaths, ALWAYS_MATCH_REG_EXP);
  }

  private _excludePaths: string[] = ['/consistency-report\\.md$/'];

  private _excludePathsRegExp = NEVER_MATCH_REG_EXP;

  private _hadDangerousSettingsReverted = false;

  private _includePaths: string[] = [];

  private _includePathsRegExp = ALWAYS_MATCH_REG_EXP;

  public isPathIgnored(path: string): boolean {
    return !this._includePathsRegExp.test(path) || this._excludePathsRegExp.test(path);
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

function makeRegExp(paths: string[], defaultRegExp: RegExp): RegExp {
  if (paths.length === 0) {
    return defaultRegExp;
  }

  const regExpStrCombined = paths.map((path) => {
    if (path.startsWith('/') && path.endsWith('/')) {
      return path.slice(1, -1);
    }
    return `^${escapeRegExp(path)}`;
  })
    .map((regExpStr) => `(${regExpStr})`)
    .join('|');
  return new RegExp(regExpStrCombined);
}
