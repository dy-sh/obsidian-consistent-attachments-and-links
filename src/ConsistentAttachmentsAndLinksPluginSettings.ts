import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';
import { escapeRegExp } from 'obsidian-dev-utils/RegExp';

const ALWAYS_MATCH_REG_EXP = /(?:)/;
const NEVER_MATCH_REG_EXP = /$./;

interface LegacySettings extends ConsistentAttachmentsAndLinksPluginSettings {
  ignoreFiles: string[];
  ignoreFolders: string[];
}

export class ConsistentAttachmentsAndLinksPluginSettings extends PluginSettingsBase {
  public autoCollectAttachments = false;

  public changeNoteBacklinksAlt = true;
  public consistencyReportFile = 'consistency-report.md';
  public deleteAttachmentsWithNote = false;
  public deleteEmptyFolders = true;
  public deleteExistFilesWhenMoveNote = false;
  public moveAttachmentsWithNote = false;
  public showBackupWarning = true;
  public updateLinks = true;
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

  private _excludePaths: string[] = [];

  private _excludePathsRegExp = NEVER_MATCH_REG_EXP;

  private _hadDangerousSettingsReverted = false;

  private _includePaths: string[] = [];

  private _includePathsRegExp = ALWAYS_MATCH_REG_EXP;

  public constructor(data: unknown) {
    super();
    this.excludePaths = ['/consistency-report\\.md$/'];
    this.init(data);
  }

  public override initFromRecord(record: Record<string, unknown>): void {
    const legacySettings = record as Partial<LegacySettings>;

    if (legacySettings.ignoreFiles || legacySettings.ignoreFolders) {
      const excludePaths = legacySettings.excludePaths ?? [];

      for (const ignoreFileRegExpStr of legacySettings.ignoreFiles ?? []) {
        excludePaths.push(`/${ignoreFileRegExpStr}$/`);
      }

      for (const ignoreFolder of legacySettings.ignoreFolders ?? []) {
        excludePaths.push(ignoreFolder);
      }

      if (excludePaths.length > 0) {
        legacySettings.excludePaths = excludePaths;
      }

      delete legacySettings.ignoreFiles;
      delete legacySettings.ignoreFolders;
    }

    super.initFromRecord(legacySettings);

    if (this.showBackupWarning) {
      this._hadDangerousSettingsReverted = this.deleteAttachmentsWithNote || this.deleteExistFilesWhenMoveNote || this.moveAttachmentsWithNote
        || this.autoCollectAttachments;
      this.deleteAttachmentsWithNote = false;
      this.deleteExistFilesWhenMoveNote = false;
      this.moveAttachmentsWithNote = false;
      this.autoCollectAttachments = false;
    }
  }

  public isPathIgnored(path: string): boolean {
    return !this._includePathsRegExp.test(path) || this._excludePathsRegExp.test(path);
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      excludePaths: this.excludePaths,
      includePaths: this.includePaths
    };
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
