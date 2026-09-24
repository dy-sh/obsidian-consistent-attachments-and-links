import { isTreatedAsAttachment } from 'obsidian-dev-utils/obsidian/file-system';
import { PathSettings } from 'obsidian-dev-utils/obsidian/path-settings';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';
import type { MigratableCollectSettings } from './custom-attachment-location.ts';

import {
  getCurrentPathCompatibilityPlatform,
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from './path-compatibility.ts';

export class PluginSettings {
  public consistencyReportFile = 'consistency-report.md';

  /**
   * Whether the user has already declined the suggestion to install Custom Attachment Location.
   *
   * Only the load-time notice honours it — the settings-tab banner is shown regardless, because a user
   * looking at these settings right now is a fresher signal than an answer they gave earlier.
   */
  public isCustomAttachmentLocationSuggestionDeclined = false;

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

  /**
   * The collect values this plugin used to own, waiting to be offered to Custom Attachment Location, which
   * owns attachment collecting from 5.0.0 on. The same one-nullable-object shape as
   * {@link proposedRenameDeleteSettings}, for the same reasons.
   */
  public proposedCollectSettings: MigratableCollectSettings | null = null;

  /**
   * The rename/delete values this plugin used to own, waiting to be offered to Advanced Rename and Delete
   * Handler. Non-`null` means an offer is still pending; `null` means there is nothing to offer, which is
   * also what a fresh install has.
   *
   * One nullable object rather than one pending property per setting, so a fresh install can never be told
   * it has a migration waiting and an applied migration is retired with a single write.
   */
  public proposedRenameDeleteSettings: MigratableSettings | null = null;

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

  public get excludePaths(): string[] {
    return this._pathSettings.excludePaths;
  }

  public set excludePaths(value: string[]) {
    this._pathSettings.excludePaths = value;
  }

  public get includePaths(): string[] {
    return this._pathSettings.includePaths;
  }

  public set includePaths(value: string[]) {
    this._pathSettings.includePaths = value;
  }

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

  public isPathIgnored(path: string): boolean {
    return this._pathSettings.isPathIgnored(path);
  }

  public isTreatedAsAttachment(path: string): boolean {
    return isTreatedAsAttachment({
      attachmentExtensions: this.treatAsAttachmentExtensions,
      pathOrFile: path
    });
  }
}
