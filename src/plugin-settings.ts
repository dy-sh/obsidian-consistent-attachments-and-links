import { isTreatedAsAttachment } from 'obsidian-dev-utils/obsidian/file-system';
import { PathSettings } from 'obsidian-dev-utils/obsidian/path-settings';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

import {
  getCurrentPathCompatibilityPlatform,
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from './path-compatibility.ts';

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

  /**
   * The length, in characters, of the longest vault root path this vault is expected to live under.
   *
   * `0` means the running vault's real root, which is what makes the on-machine check exact with nothing
   * configured — and what keeps a machine-specific number out of `data.json`. The root of a platform the
   * check is NOT running on is unknowable, so it is stated here rather than guessed; set it to the length of
   * the deepest place this vault is synced to. A value below the real root's length is a warning, never a
   * silent clamp: it means the path budget is smaller than reality and every check is over-strict.
   */
  public maxVaultRootPathLength = 0;

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

  /**
   * Whether a missing note may be CREATED to hold the original name of a repaired file or folder.
   *
   * Off by default: a folder with no folder note, and an attachment with no sidecar, are reported instead.
   * Nothing appears on disk that the user did not ask for.
   */
  public shouldCreateNoteToPreserveOriginalName = false;

  /*
   * One toggle per platform rather than a list of numbers, because the constraints are not comparable: only
   * Windows' path budget and only ext4's 255-BYTE name limit ever bind, in different units. The current
   * platform starts on so a fresh install reports on the vault in front of it; every other platform is the
   * user saying where else this vault lives.
   */
  public shouldEnsurePathCompatibilityOnAndroid = getCurrentPathCompatibilityPlatform() === PathCompatibilityPlatform.Android;

  /**
   * Enforces every platform's rules at once, whatever the individual toggles say.
   */
  public shouldEnsurePathCompatibilityOnEveryPlatform = false;
  public shouldEnsurePathCompatibilityOnIos = getCurrentPathCompatibilityPlatform() === PathCompatibilityPlatform.Ios;
  public shouldEnsurePathCompatibilityOnLinux = getCurrentPathCompatibilityPlatform() === PathCompatibilityPlatform.Linux;
  public shouldEnsurePathCompatibilityOnMacOs = getCurrentPathCompatibilityPlatform() === PathCompatibilityPlatform.MacOs;
  public shouldEnsurePathCompatibilityOnWindows = getCurrentPathCompatibilityPlatform() === PathCompatibilityPlatform.Windows;

  public shouldShowBackupWarning = true;

  /**
   * Names the sidecar note that carries an attachment's original name.
   *
   * Tokens: `{{fileName}}` (the whole name, extension included), `{{basename}}`, `{{extension}}`. The
   * default `{{fileName}}.md` makes `diagram.png` answer `diagram.png.md`, which cannot collide with a real
   * note the way `{{basename}}.md` can.
   */
  public sidecarNoteNamePattern = '{{fileName}}.md';
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

  /**
   * The platforms whose naming rules are currently enforced.
   *
   * @returns The enabled platforms, empty when the feature is off — which is what makes it a no-op rather
   * than a special case anywhere downstream.
   */
  public getPathCompatibilityPlatforms(): PathCompatibilityPlatform[] {
    if (this.shouldEnsurePathCompatibilityOnEveryPlatform) {
      return [...PATH_COMPATIBILITY_PLATFORMS];
    }

    const flags: Record<PathCompatibilityPlatform, boolean> = {
      [PathCompatibilityPlatform.Android]: this.shouldEnsurePathCompatibilityOnAndroid,
      [PathCompatibilityPlatform.Ios]: this.shouldEnsurePathCompatibilityOnIos,
      [PathCompatibilityPlatform.Linux]: this.shouldEnsurePathCompatibilityOnLinux,
      [PathCompatibilityPlatform.MacOs]: this.shouldEnsurePathCompatibilityOnMacOs,
      [PathCompatibilityPlatform.Windows]: this.shouldEnsurePathCompatibilityOnWindows
    };

    return PATH_COMPATIBILITY_PLATFORMS.filter((platform) => flags[platform]);
  }

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
