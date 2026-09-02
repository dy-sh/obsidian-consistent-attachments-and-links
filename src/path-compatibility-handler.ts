/**
 * @file
 *
 * The vault pass over {@link ./path-compatibility.ts}: finds every file and folder whose path or name is
 * invalid on an enabled platform, reports them, and repairs them on command.
 *
 * Renames go through `renameSafe`, which renames via `app.fileManager.renameFile` — so Obsidian rewrites
 * every link to the file, and Advanced Rename and Delete Handler moves its attachments. The reference
 * implementation this came from (`F:\Obsidian\.scripts\src\Invocables\FixLongPaths.ts`) used
 * `app.vault.rename`, which does neither; in a plugin whose subject is link consistency that is not a
 * detail.
 */

import type {
  App,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { ResourceLockComponent } from 'obsidian-dev-utils/obsidian/resource-lock';

import { getDataAdapterEx } from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  addAlias,
  processFrontmatter
} from 'obsidian-dev-utils/obsidian/file-manager';
import {
  asFile,
  getFileOrNull,
  getOrCreateFile,
  isFolder,
  isMarkdownFile
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  FolderNoteLocation,
  resolveFolderNote,
  resolveFolderNoteConfig
} from 'obsidian-dev-utils/obsidian/folder-note';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { generateMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getSafeRenamePath,
  renameSafe
} from 'obsidian-dev-utils/obsidian/vault';

import type {
  PathCompatibilityPlatform,
  PathCompatibilityViolation
} from './path-compatibility.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import {
  findPathCompatibilityViolations,
  PATH_COMPATIBILITY_PLATFORM_LABELS,
  PathCompatibilityViolationType,
  repairName
} from './path-compatibility.ts';

enum FixOutcome {
  NotNeeded = 'NotNeeded',
  Repaired = 'Repaired',
  Unrepairable = 'Unrepairable'
}

/**
 * One offending file or folder, as the consistency report shows it.
 */
export interface PathCompatibilityEntry {
  /**
   * The path the repair would produce, or `null` when no name survives the repair.
   *
   * Making the read-only check answer this too is what turns the report into a preview of the repair rather
   * than a list of complaints.
   */
  readonly newPath: null | string;

  /**
   * The offending vault-relative path.
   */
  readonly path: string;

  /**
   * Everything wrong with it, across every enabled platform.
   */
  readonly violations: readonly PathCompatibilityViolation[];
}

interface PathCompatibilityHandlerConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly resourceLockComponent: null | ResourceLockComponent;
}

/**
 * The limits one pass holds every item to: resolved once, then carried through the repair.
 */
interface PathCompatibilityScope {
  readonly maxVaultRootPathLength: number;
  readonly platforms: readonly PathCompatibilityPlatform[];
}

interface ResolvedName {
  readonly basename: string;
  readonly extension: string;
}

/**
 * A lookup rather than a `switch`: exhaustive over the enum by its own type, with no unreachable `default`
 * clause that no test could ever cover.
 */
const VIOLATION_DESCRIBERS: Record<PathCompatibilityViolationType, (platform: string) => string> = {
  [PathCompatibilityViolationType.ForbiddenCharacter]: (platform) => t(($) => $.pathCompatibility.violation.forbiddenCharacter, { platform }),
  [PathCompatibilityViolationType.NameTooLong]: (platform) => t(($) => $.pathCompatibility.violation.nameTooLong, { platform }),
  [PathCompatibilityViolationType.PathTooLong]: (platform) => t(($) => $.pathCompatibility.violation.pathTooLong, { platform }),
  [PathCompatibilityViolationType.ReservedName]: (platform) => t(($) => $.pathCompatibility.violation.reservedName, { platform }),
  [PathCompatibilityViolationType.TrailingCharacter]: (platform) => t(($) => $.pathCompatibility.violation.trailingCharacter, { platform })
};

/**
 * The `Path compatibility` section of the consistency report.
 */
export class PathCompatibilityCheckResult {
  /**
   * The offending items, in vault order.
   */
  public readonly entries: PathCompatibilityEntry[] = [];

  /**
   * Set when the real vault root is longer than the configured maximum, which makes every path check
   * stricter than reality. A warning rather than a silent clamp.
   */
  public vaultRootWarning: null | string = null;

  public add(entry: PathCompatibilityEntry): void {
    this.entries.push(entry);
  }

  public toString(app: App, reportPath: string): string {
    const title = t(($) => $.pathCompatibility.report.title);
    const warningLine = this.vaultRootWarning === null ? '' : `> [!WARNING]\n> ${this.vaultRootWarning}\n\n`;

    if (this.entries.length === 0) {
      return `# ${title}\n${warningLine}${t(($) => $.pathCompatibility.report.noProblems)}\n\n`;
    }

    let $string = `# ${title} (${String(this.entries.length)} items)\n${warningLine}`;

    for (const entry of this.entries) {
      $string += `${describeItem(app, entry.path, reportPath)}:\n`;

      for (const violation of entry.violations) {
        $string += `- ${describeViolation(violation)}\n`;
      }

      $string += entry.newPath === null
        ? `- ${t(($) => $.pathCompatibility.report.cannotRepair)}\n`
        : `- ${t(($) => $.pathCompatibility.report.wouldBecome, { newPath: entry.newPath })}\n`;
      $string += '\n\n';
    }

    return $string;
  }
}

export class PathCompatibilityHandler {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly resourceLockComponent: null | ResourceLockComponent;

  public constructor(params: PathCompatibilityHandlerConstructorParams) {
    this.abortSignalComponent = params.abortSignalComponent;
    this.app = params.app;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.resourceLockComponent = params.resourceLockComponent;
  }

  /**
   * Fills the report section. Changes nothing.
   *
   * @param result - The section to fill.
   */
  public check(result: PathCompatibilityCheckResult): void {
    const platforms = this.pluginSettingsComponent.settings.getPathCompatibilityPlatforms();

    if (platforms.length === 0) {
      return;
    }

    result.vaultRootWarning = this.buildVaultRootWarning();
    const maxVaultRootPathLength = this.resolveMaxVaultRootPathLength();

    const scope: PathCompatibilityScope = { maxVaultRootPathLength, platforms };

    for (const file of this.getSortedAbstractFiles()) {
      const violations = this.findViolations(file, scope);

      if (violations.length === 0) {
        continue;
      }

      const newName = this.repair(file, scope);
      result.add({
        newPath: newName === null ? null : joinPath(getParentPath(file), newName),
        path: file.path,
        violations
      });
    }
  }

  /**
   * Repairs every offending file and folder.
   */
  public async fix(): Promise<void> {
    const platforms = this.pluginSettingsComponent.settings.getPathCompatibilityPlatforms();

    if (platforms.length === 0) {
      this.pluginNoticeComponent.showNotice(t(($) => $.pathCompatibility.notice.noPlatformsEnabled));
      return;
    }

    const vaultRootWarning = this.buildVaultRootWarning();

    if (vaultRootWarning !== null) {
      this.pluginNoticeComponent.showNotice(vaultRootWarning);
    }

    const maxVaultRootPathLength = this.resolveMaxVaultRootPathLength();
    let repairedCount = 0;
    const unrepairablePaths: string[] = [];

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => t(($) => $.pathCompatibility.progressBar.message, { iterationString, path: item.path }),
      items: this.getSortedAbstractFiles(),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (file) => {
        const outcome = await this.fixFile(file, { maxVaultRootPathLength, platforms });

        if (outcome === FixOutcome.Repaired) {
          repairedCount++;
        } else if (outcome === FixOutcome.Unrepairable) {
          unrepairablePaths.push(file.path);
        }
      },
      progressBarTitle: t(($) => $.pathCompatibility.progressBar.title),
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    this.pluginNoticeComponent.showNotice(
      repairedCount === 0
        ? t(($) => $.pathCompatibility.notice.nothingToRepair)
        : t(($) => $.pathCompatibility.notice.repaired, { count: repairedCount })
    );

    if (unrepairablePaths.length > 0) {
      this.pluginNoticeComponent.showNotice(
        t(($) => $.pathCompatibility.notice.unrepairable, { count: unrepairablePaths.length, paths: unrepairablePaths.join(', ') })
      );
    }
  }

  private buildVaultRootWarning(): null | string {
    const configured = this.pluginSettingsComponent.settings.maxVaultRootPathLength;
    const real = this.getRealVaultRootPathLength();

    if (configured === 0 || real <= configured) {
      return null;
    }

    return t(($) => $.pathCompatibility.report.vaultRootWarning, { maxLength: configured, realLength: real });
  }

  private findViolations(file: TAbstractFile, scope: PathCompatibilityScope): PathCompatibilityViolation[] {
    if (this.pluginSettingsComponent.settings.isPathIgnored(file.path)) {
      return [];
    }

    return this.findViolationsAt(file, scope, file.path);
  }

  private findViolationsAt(file: TAbstractFile, scope: PathCompatibilityScope, path: string): PathCompatibilityViolation[] {
    return findPathCompatibilityViolations({
      isFolder: isFolder(file),
      maxVaultRootPathLength: scope.maxVaultRootPathLength,
      path,
      platforms: scope.platforms
    });
  }

  private async fixFile(file: TAbstractFile, scope: PathCompatibilityScope): Promise<FixOutcome> {
    if (this.findViolations(file, scope).length === 0) {
      return FixOutcome.NotNeeded;
    }

    const newName = this.repair(file, scope);
    return newName === null ? FixOutcome.Unrepairable : await this.renameToName(file, scope, newName);
  }

  /**
   * Renames an attachment's sidecar note so it keeps matching the pattern that names it.
   *
   * Leaving it behind would create exactly the kind of broken association this plugin exists to prevent —
   * the rename is ours, so the mismatch is ours to fix. Keeping a bundle together in general is File
   * Bundles' job, not this plugin's; this is only the sidecar the preservation itself relies on.
   *
   * @param file - The just-renamed file.
   * @param sidecar - The sidecar resolved BEFORE the rename, or `null` when there was none.
   */
  private async followWithSidecar(file: TAbstractFile, sidecar: null | TFile): Promise<void> {
    if (sidecar === null || isFolder(file)) {
      return;
    }

    const newSidecarPath = joinPath(getParentPath(file), this.renderSidecarName(asFile(file)));

    if (newSidecarPath === sidecar.path) {
      return;
    }

    await renameSafe({ app: this.app, newPath: newSidecarPath, oldPathOrAbstractFile: sidecar });
  }

  private getRealVaultRootPathLength(): number {
    return getDataAdapterEx(this.app).basePath.length;
  }

  private getSortedAbstractFiles(): TAbstractFile[] {
    /*
     * Ascending path order puts a parent folder before everything inside it, so shortening the parent is
     * measured by its children rather than duplicated in them. Every consumer re-reads `file.path` per item,
     * because a rename mutates it.
     */
    return this.app.vault.getAllLoadedFiles()
      .filter((file) => !(isFolder(file) && file.isRoot()))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Writes the original name into the note that describes the item: the file itself for a markdown note, the
   * folder note for a folder, the sidecar note for anything else.
   *
   * @param file - The just-renamed file or folder.
   * @param originalName - The name it had.
   */
  private async preserveOriginalName(file: TAbstractFile, originalName: string): Promise<void> {
    const note = await this.resolvePreservationNote(file);

    if (note === null) {
      return;
    }

    await addAlias({
      alias: originalName,
      app: this.app,
      pathOrFile: note,
      resourceLockComponent: this.resourceLockComponent
    });

    await processFrontmatter({
      app: this.app,
      frontmatterFunction: (frontmatter) => {
        frontmatter['title'] = originalName;
      },
      pathOrFile: note,
      pluginNoticeComponent: this.pluginNoticeComponent,
      resourceLockComponent: this.resourceLockComponent
    });
  }

  private async renameToName(file: TAbstractFile, scope: PathCompatibilityScope, newName: string): Promise<FixOutcome> {
    const newPath = joinPath(getParentPath(file), newName);

    /*
     * `renameSafe` resolves a collision by appending ` 1`, which can push the name back over the very limit
     * it was just brought under. So the resolved path is re-checked, and the candidate shrunk and retried
     * until it converges — the reference implementation never had to handle this because it never resolved
     * collisions at all.
     */
    const safePath = getSafeRenamePath({ app: this.app, newPath, oldPathOrAbstractFile: file });

    if (safePath !== newPath && this.findViolationsAt(file, scope, safePath).length > 0) {
      return await this.retryWithShorterName(file, scope, newName);
    }

    const oldName = file.name;
    const sidecar = this.resolveSidecarNote(file);
    await renameSafe({ app: this.app, newPath, oldPathOrAbstractFile: file });
    await this.followWithSidecar(file, sidecar);
    await this.preserveOriginalName(file, oldName);
    return FixOutcome.Repaired;
  }

  /*
   * Replacer FUNCTIONS, not strings: a file named `a$&b` would otherwise have its `$&` expanded as a
   * backreference, and the sidecar would be looked up under a name no file has.
   */
  private renderSidecarName(file: TFile): string {
    return this.pluginSettingsComponent.settings.sidecarNoteNamePattern
      .replaceAll('{{fileName}}', () => file.name)
      .replaceAll('{{basename}}', () => file.basename)
      .replaceAll('{{extension}}', () => file.extension);
  }

  private repair(file: TAbstractFile, scope: PathCompatibilityScope, basenameOverride?: string): null | string {
    const { basename, extension } = splitName(file);

    return repairName({
      basename: basenameOverride ?? basename,
      extension,
      isFolder: isFolder(file),
      maxVaultRootPathLength: scope.maxVaultRootPathLength,
      parentPath: getParentPath(file),
      platforms: scope.platforms
    });
  }

  private async resolveFolderNoteToCreate(folder: TFolder): Promise<null | TFile> {
    const config = resolveFolderNoteConfig({ app: this.app });

    if (config.location === FolderNoteLocation.None) {
      return null;
    }

    const name = config.resolveName(folder);
    const extension = config.extensions[0];

    if (name.trim() === '' || extension === undefined) {
      return null;
    }

    const folderPath = config.location === FolderNoteLocation.InsideFolder ? folder.path : getParentPath(folder);
    return await getOrCreateFile(this.app, joinPath(folderPath, `${name}.${extension}`));
  }

  private resolveMaxVaultRootPathLength(): number {
    const configured = this.pluginSettingsComponent.settings.maxVaultRootPathLength;
    return configured === 0 ? this.getRealVaultRootPathLength() : configured;
  }

  /**
   * The note whose frontmatter carries the original name, created only when the user has opted in.
   *
   * @param file - The renamed file or folder.
   * @returns The note, or `null` when there is none and none may be created.
   */
  private async resolvePreservationNote(file: TAbstractFile): Promise<null | TFile> {
    const shouldCreate = this.pluginSettingsComponent.settings.shouldCreateNoteToPreserveOriginalName;

    if (isFolder(file)) {
      const folderNote = resolveFolderNote({ app: this.app, folder: file });

      if (folderNote !== null) {
        return folderNote;
      }

      return shouldCreate ? await this.resolveFolderNoteToCreate(file) : null;
    }

    if (isMarkdownFile(file)) {
      return asFile(file);
    }

    const sidecarPath = joinPath(getParentPath(file), this.renderSidecarName(asFile(file)));
    const sidecar = getFileOrNull({ app: this.app, pathOrFile: sidecarPath });

    if (sidecar !== null) {
      return sidecar;
    }

    return shouldCreate ? await getOrCreateFile(this.app, sidecarPath) : null;
  }

  private resolveSidecarNote(file: TAbstractFile): null | TFile {
    if (isFolder(file) || isMarkdownFile(file)) {
      return null;
    }

    return getFileOrNull({
      app: this.app,
      pathOrFile: joinPath(getParentPath(file), this.renderSidecarName(asFile(file)))
    });
  }

  /**
   * Retries a repair against a name one code point shorter, which is the only lever left once a collision
   * suffix has pushed the repaired name back over a limit.
   *
   * Terminates because the basename it feeds back is strictly shorter every time.
   *
   * @param file - The file being repaired.
   * @param scope - The limits it is being held to.
   * @param newName - The name the last attempt produced.
   * @returns The outcome.
   */
  private async retryWithShorterName(file: TAbstractFile, scope: PathCompatibilityScope, newName: string): Promise<FixOutcome> {
    const { basename } = splitName(file, newName);
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Code points are exactly the unit wanted: cutting by UTF-16 unit would split a surrogate pair.
    const codePoints = [...basename];
    codePoints.pop();
    const shorterName = codePoints.length === 0 ? null : this.repair(file, scope, codePoints.join(''));

    return shorterName === null ? FixOutcome.Unrepairable : await this.renameToName(file, scope, shorterName);
  }
}

function describeItem(app: App, path: string, reportPath: string): string {
  const file = getFileOrNull({ app, pathOrFile: path });

  // A folder has no link form, so every item is also shown as a path — the link is an addition, not a
  // Replacement.
  const link = file === null ? '' : `${generateMarkdownLink({ app, sourcePathOrFile: reportPath, targetPathOrFile: file })} `;
  return `${link}\`${path}\``;
}

function describeViolation(violation: PathCompatibilityViolation): string {
  const platform = PATH_COMPATIBILITY_PLATFORM_LABELS[violation.platform];
  return VIOLATION_DESCRIBERS[violation.type](platform);
}

function getParentPath(file: TAbstractFile): string {
  return file.parent === null || file.parent.isRoot() ? '' : file.parent.path;
}

function joinPath(parentPath: string, name: string): string {
  return parentPath === '' ? name : `${parentPath}/${name}`;
}

function splitName(file: TAbstractFile, name?: string): ResolvedName {
  if (isFolder(file)) {
    return { basename: name ?? file.name, extension: '' };
  }

  const asFile2 = asFile(file);

  if (name === undefined) {
    return { basename: asFile2.basename, extension: asFile2.extension };
  }

  const dotIndex = name.lastIndexOf('.');
  return dotIndex <= 0 ? { basename: name, extension: '' } : { basename: name.slice(0, dotIndex), extension: name.slice(dotIndex + 1) };
}
