import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { BulkOperationCommitComponent } from '@mnaoumov/obsidian-lib/components/bulk-operation-commit-component';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { ResourceLockComponent } from '@mnaoumov/obsidian-lib/resource-lock';
import type {
  App,
  Reference
} from 'obsidian';

import { reportBulkOperationProgress } from '@mnaoumov/obsidian-lib/bulk-operation-progress';
import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import {
  editReferences,
  splitSubpath
} from '@mnaoumov/obsidian-lib/link';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import { getCacheSafe } from '@mnaoumov/obsidian-lib/metadata-cache';
import { getMarkdownFilesSorted } from '@mnaoumov/obsidian-lib/vault';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  FileSystemAdapter,
  parseFrontMatterAliases,
  Platform
} from 'obsidian';

import type { LinksHandler } from '../consistency-check/links-handler.ts';
import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type {
  BrokenLinkCandidate,
  GitRename
} from './broken-link-candidates.ts';

import { getReferenceTargetPath } from '../consistency-check/links-handler.ts';
import { BrokenLinkCandidateFinder } from './broken-link-candidates.ts';
import { loadGitRenames } from './git-rename-history.ts';
import {
  computeNewLinkPath,
  replaceLinkPath
} from './link-path-rewriter.ts';

/**
 * Where in a note a broken link is written.
 */
export enum BrokenLinkKind {
  Embed = 'Embed',
  FrontmatterLink = 'FrontmatterLink',
  Link = 'Link'
}

/**
 * A link whose written path does not lead to its target, and the files it may have meant.
 */
export interface BrokenLink {
  /**
   * The files the link may have meant, strongest evidence first. Empty when nothing is known, and always
   * empty when {@link isTargetFound}.
   */
  readonly candidates: readonly BrokenLinkCandidate[];

  /**
   * Whether a file is at {@link targetPath}, so only the link's heading or block is missing.
   */
  readonly isTargetFound: boolean;

  readonly kind: BrokenLinkKind;
  readonly reference: Reference;

  /**
   * The path of the note holding the link.
   */
  readonly sourcePath: string;

  /**
   * The vault path the link's written path leads to.
   */
  readonly targetPath: string;
}

/**
 * One fix: a broken link and the file it should lead to.
 */
export interface BrokenLinkFix {
  readonly brokenLink: BrokenLink;
  readonly targetPath: string;
}

interface BrokenLinkFixerConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly bulkOperationCommitComponent: BulkOperationCommitComponent;
  readonly linksHandler: LinksHandler;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly resourceLockComponent: null | ResourceLockComponent;
}

interface FoundBrokenLink extends BrokenLink {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Candidate discovery fills this field after collecting all missing links.
  candidates: readonly BrokenLinkCandidate[];
}

/**
 * Finds the broken links of the vault with the files each may have meant, and repairs one by changing only the
 * path written in it.
 */
export class BrokenLinkFixer {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly bulkOperationCommitComponent: BulkOperationCommitComponent;
  private readonly linksHandler: LinksHandler;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly resourceLockComponent: null | ResourceLockComponent;

  public constructor(params: BrokenLinkFixerConstructorParams) {
    this.abortSignalComponent = params.abortSignalComponent;
    this.app = params.app;
    this.bulkOperationCommitComponent = params.bulkOperationCommitComponent;
    this.linksHandler = params.linksHandler;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.resourceLockComponent = params.resourceLockComponent;
  }

  /**
   * Finds every broken link in the notes the include and exclude paths leave in, with its candidates.
   *
   * @returns The broken links, in note path order.
   */
  public async findBrokenLinks(): Promise<BrokenLink[]> {
    const brokenLinks: FoundBrokenLink[] = [];

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Looking for broken links ${iterationString} - ${item.path}`,
      // Never the consistency report: its links are findings about other notes, not links to repair.
      items: getMarkdownFilesSorted(this.app).filter((note) =>
        !this.pluginSettingsComponent.settings.isPathIgnored(note.path)
        && !this.pluginSettingsComponent.settings.isConsistencyReportPath(note.path)
      ),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (note) => {
        const cache = await getCacheSafe(this.app, note.path);
        if (!cache) {
          return;
        }

        for (
          const [references, kind] of [
            [cache.links ?? [], BrokenLinkKind.Link],
            [cache.embeds ?? [], BrokenLinkKind.Embed],
            [cache.frontmatterLinks ?? [], BrokenLinkKind.FrontmatterLink]
          ] as const
        ) {
          for (const reference of references) {
            if (await this.linksHandler.resolveValidReferenceTarget(reference, note.path)) {
              continue;
            }

            const targetPath = getReferenceTargetPath(reference, note.path);
            brokenLinks.push({
              candidates: [],
              isTargetFound: !!getFileOrNull({ app: this.app, pathOrFile: targetPath }),
              kind,
              reference,
              sourcePath: note.path,
              targetPath
            });
          }
        }
      },
      progressBarTitle: 'Looking for broken links...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    const missingLinks = brokenLinks.filter((brokenLink) => !brokenLink.isTargetFound && !brokenLink.targetPath.startsWith('../'));
    if (missingLinks.length === 0) {
      return brokenLinks;
    }

    const finder = await this.createCandidateFinder();
    const candidatesByPath = finder.findAll(missingLinks.map((brokenLink) => brokenLink.targetPath));
    for (const brokenLink of missingLinks) {
      brokenLink.candidates = ensureNonNullable(candidatesByPath.get(brokenLink.targetPath));
    }

    return brokenLinks;
  }

  /**
   * Repairs broken links by writing a new path in each, and nothing else.
   *
   * The links of one note are repaired in one pass over it. A link is matched by its text and its line (its
   * frontmatter key for a frontmatter link) rather than by its offset, because an earlier fix on the same line
   * moves every offset after it.
   *
   * @param fixes - The fixes to apply.
   * @returns The fixes applied; one is missing when its link was no longer in its note as found.
   */
  public async fix(fixes: readonly BrokenLinkFix[]): Promise<BrokenLinkFix[]> {
    const sourcePaths = new Set(fixes.map((fix) => fix.brokenLink.sourcePath));
    const appliedFixes = new Set<BrokenLinkFix>();

    // One click is one bulk operation, so one revert undoes it. This walk is not a `loop()`, so it refreshes the
    // commit lock's heartbeat itself, once per note.
    await this.bulkOperationCommitComponent.runBulkOperation({
      operation: async () => {
        for (const sourcePath of sourcePaths) {
          const sourceFixes = fixes.filter((fix) => fix.brokenLink.sourcePath === sourcePath);
          await editReferences({
            app: this.app,
            pathOrFile: sourcePath,
            pluginNoticeComponent: this.pluginNoticeComponent,
            referenceConverter: (link) => {
              const fix = sourceFixes.find((sourceFix) => isSameReference(link, sourceFix.brokenLink.reference));
              if (!fix) {
                return;
              }

              appliedFixes.add(fix);
              const { linkPath } = splitSubpath(fix.brokenLink.reference.link);
              return replaceLinkPath(link.original, computeNewLinkPath({ oldLinkPath: linkPath, sourcePath, targetPath: fix.targetPath }));
            },
            resourceLockComponent: this.resourceLockComponent
          });
          reportBulkOperationProgress();
        }
      },
      summary: buildFixSummary(fixes.length, [...sourcePaths])
    });

    return fixes.filter((fix) => appliedFixes.has(fix));
  }

  private async createCandidateFinder(): Promise<BrokenLinkCandidateFinder> {
    const aliasesByPath = new Map<string, readonly string[]>();
    const titlesByPath = new Map<string, string>();

    for (const note of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(note)?.frontmatter;
      const aliases = parseFrontMatterAliases(frontmatter) ?? [];
      if (aliases.length > 0) {
        aliasesByPath.set(note.path, aliases);
      }
      const title: unknown = frontmatter?.['title'];
      if (typeof title === 'string' && title) {
        titlesByPath.set(note.path, title);
      }
    }

    const { settings } = this.pluginSettingsComponent;
    return new BrokenLinkCandidateFinder({
      aliasesByPath,
      filePaths: this.app.vault.getFiles().map((file) => file.path),
      folderNoteFileNames: settings.folderNoteFileNames,
      gitRenames: settings.shouldUseGitHistoryForBrokenLinks ? await this.loadGitRenames() : new Map(),
      titlesByPath
    });
  }

  private async loadGitRenames(): Promise<Map<string, GitRename>> {
    const { adapter } = this.app.vault;
    if (!Platform.isDesktopApp || !(adapter instanceof FileSystemAdapter)) {
      return new Map();
    }

    const { createDesktopGitRunner } = await import('./desktop-git-runner.ts');
    return await loadGitRenames({ runGit: createDesktopGitRunner(adapter.getBasePath()) });
  }
}

/**
 * Builds the commit subject of one `Fix broken links` click: the command and its scope.
 *
 * @param linkCount - How many links the click asked to fix.
 * @param sourcePaths - The notes holding them.
 * @returns `Fix broken links: 1 link in Notes/a.md`, or `Fix broken links: 5 links in 3 notes`.
 */
export function buildFixSummary(linkCount: number, sourcePaths: readonly string[]): string {
  const links = linkCount === 1 ? '1 link' : `${String(linkCount)} links`;
  const notes = sourcePaths.length === 1 ? ensureNonNullable(sourcePaths[0]) : `${String(sourcePaths.length)} notes`;
  return `Fix broken links: ${links} in ${notes}`;
}

/**
 * Whether two references are the same link, as far as a note edited since one of them was read can tell.
 *
 * @param link - A reference read now.
 * @param reference - A reference read earlier.
 * @returns Whether they are the same text on the same line, or under the same frontmatter key.
 */
function isSameReference(link: Reference, reference: Reference): boolean {
  if (link.original !== reference.original) {
    return false;
  }

  return isReferenceCache(link) && isReferenceCache(reference) ? link.position.start.line === reference.position.start.line : isFrontmatterLinkCache(link) && isFrontmatterLinkCache(reference) && link.key === reference.key;
}
