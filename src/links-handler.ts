import type {
  Reference,
  ReferenceCache
} from 'obsidian';
import type { EditorLockComponent } from 'obsidian-dev-utils/obsidian/editor-lock';
import type { FileChange } from 'obsidian-dev-utils/obsidian/file-change';
import type { GenerateMarkdownLinkParams } from 'obsidian-dev-utils/obsidian/link';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  App,
  normalizePath,
  resolveSubpath,
  TFile
} from 'obsidian';
import { normalizeOptionalProperties } from 'obsidian-dev-utils/object-utils';
import { applyFileChanges } from 'obsidian-dev-utils/obsidian/file-change';
import {
  getFileOrNull,
  MARKDOWN_FILE_EXTENSION
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  extractLinkFile,
  generateMarkdownLink,
  LinkPathStyle,
  LinkStyle,
  splitSubpath,
  testWikilink,
  updateLinksInFile
} from 'obsidian-dev-utils/obsidian/link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { referenceToFileChange } from 'obsidian-dev-utils/obsidian/reference';
import {
  dirname,
  join
} from 'obsidian-dev-utils/path';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

interface LinksHandlerConstructorParams {
  readonly app: App;
  readonly editorLockComponent: EditorLockComponent | null;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface LinksHandlerConvertLinkParams {
  readonly forceRelativePath?: boolean | undefined;
  readonly link: Reference;
  readonly note: TFile;
  readonly oldNotePath: string;
  readonly pathChangeMap?: Map<string, string> | undefined;
}

interface ReferenceChangeInfo {
  newLink: string;
  old: ReferenceCache;
}

export class ConsistencyCheckResult extends Map<string, Reference[]> {
  public constructor(private readonly title: string) {
    super();
  }

  public add(notePath: string, link: Reference): void {
    if (!this.has(notePath)) {
      this.set(notePath, []);
    }
    const arr = ensureNonNullable(this.get(notePath));
    arr.push(link);
  }

  public override toString(app: App, reportPath: string): string {
    if (this.size > 0) {
      let str = `# ${this.title} (${String(this.size)} files)\n`;
      for (const notePath of this.keys()) {
        const note = getFileOrNull({ app, pathOrFile: notePath });
        if (!note) {
          continue;
        }
        const linkStr = generateMarkdownLink({
          app,
          sourcePathOrFile: reportPath,
          targetPathOrFile: note
        });
        str += `${linkStr}:\n`;
        for (const link of ensureNonNullable(this.get(notePath))) {
          if (isReferenceCache(link)) {
            str += `- (line ${String(link.position.start.line + 1)}): \`${link.link}\`\n`;
          } else if (isFrontmatterLinkCache(link)) {
            str += `- (key ${link.key}): \`${link.link}\`\n`;
          }
        }
        str += '\n\n';
      }
      return str;
    }
    return `# ${this.title}\nNo problems found\n\n`;
  }
}

export class LinksHandler {
  private readonly app: App;
  private readonly editorLockComponent: EditorLockComponent | null;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: LinksHandlerConstructorParams) {
    this.app = params.app;
    this.editorLockComponent = params.editorLockComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async checkConsistency(
    note: TFile,
    badLinks: ConsistencyCheckResult,
    badEmbeds: ConsistencyCheckResult,
    wikiLinks: ConsistencyCheckResult,
    wikiEmbeds: ConsistencyCheckResult,
    badFrontmatterLinks: ConsistencyCheckResult
  ): Promise<void> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.app, note.path);
    if (!cache) {
      return;
    }
    const links = cache.links ?? [];
    const embeds = cache.embeds ?? [];
    const frontmatterLinks = cache.frontmatterLinks ?? [];

    for (const link of links) {
      if (!(await this.isValidLink(link, note.path))) {
        badLinks.add(note.path, link);
      }

      if (testWikilink(link.original)) {
        wikiLinks.add(note.path, link);
      }
    }

    for (const embed of embeds) {
      if (!(await this.isValidLink(embed, note.path))) {
        badEmbeds.add(note.path, embed);
      }

      if (testWikilink(embed.original)) {
        wikiEmbeds.add(note.path, embed);
      }
    }

    for (const frontmatterLink of frontmatterLinks) {
      if (!(await this.isValidLink(frontmatterLink, note.path))) {
        badFrontmatterLinks.add(note.path, frontmatterLink);
      }
    }
  }

  public async convertAllNoteEmbedsPathsToRelative(notePath: string, abortSignal: AbortSignal): Promise<ReferenceChangeInfo[]> {
    return await this.convertAllNoteRefPathsToRelative(notePath, true, abortSignal);
  }

  public async convertAllNoteLinksPathsToRelative(notePath: string, abortSignal: AbortSignal): Promise<ReferenceChangeInfo[]> {
    return await this.convertAllNoteRefPathsToRelative(notePath, false, abortSignal);
  }

  public async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string, embedOnlyLinks: boolean, abortSignal: AbortSignal): Promise<number> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(notePath)) {
      return 0;
    }

    const noteFile = getFileOrNull({ app: this.app, pathOrFile: notePath });
    if (!noteFile) {
      console.warn(`can't update wikilinks in note, file not found: ${notePath}`);
      return 0;
    }

    const cache = await getCacheSafe(this.app, noteFile);
    abortSignal.throwIfAborted();
    if (!cache) {
      return 0;
    }

    const links = (embedOnlyLinks ? cache.embeds : cache.links) ?? [];
    const result = links.filter((link) => testWikilink(link.original)).length;
    await updateLinksInFile({
      app: this.app,
      editorLockComponent: this.editorLockComponent,
      linkStyle: LinkStyle.Markdown,
      newSourcePathOrFile: noteFile,
      shouldUpdateEmbedOnlyLinks: embedOnlyLinks
    });
    return result;
  }

  private async convertAllNoteRefPathsToRelative(notePath: string, isEmbed: boolean, abortSignal: AbortSignal): Promise<ReferenceChangeInfo[]> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(notePath)) {
      return [];
    }

    const note = getFileOrNull({ app: this.app, pathOrFile: notePath });
    if (!note) {
      return [];
    }

    const changedRefs: ReferenceChangeInfo[] = [];

    await applyFileChanges({
      abortSignal,
      app: this.app,
      changesProvider: async ({ content }) => {
        const cache = await getCacheSafe(this.app, note);
        abortSignal.throwIfAborted();
        const cachedContent = await this.app.vault.cachedRead(note);
        abortSignal.throwIfAborted();
        if (content !== cachedContent) {
          return null;
        }
        if (!cache) {
          return [];
        }
        const refs = (isEmbed ? cache.embeds : cache.links) ?? [];
        const changes: FileChange[] = [];

        for (const ref of refs) {
          const newContent = this.convertLink({
            forceRelativePath: true,
            link: ref,
            note,
            oldNotePath: notePath
          });
          changes.push(referenceToFileChange(ref, newContent));
          changedRefs.push({ newLink: newContent, old: ref });
        }

        return changes;
      },
      editorLockComponent: this.editorLockComponent,
      pathOrFile: note
    });

    return changedRefs;
  }

  private convertLink({
    forceRelativePath,
    link,
    note,
    oldNotePath,
    pathChangeMap
  }: LinksHandlerConvertLinkParams): string {
    const { linkPath, subpath } = splitSubpath(link.link);
    const oldLinkPath = extractLinkFile({ app: this.app, link, sourcePathOrFile: oldNotePath })?.path ?? join(dirname(oldNotePath), linkPath);
    const newLinkPath = pathChangeMap
      ? pathChangeMap.get(oldLinkPath)
      : extractLinkFile({ app: this.app, link, sourcePathOrFile: note.path })?.path ?? join(dirname(note.path), linkPath);
    if (!newLinkPath) {
      return link.original;
    }

    const targetPathOrFile = getFileOrNull({ app: this.app, pathOrFile: newLinkPath }) ?? getFileOrNull({ app: this.app, pathOrFile: oldLinkPath });

    if (!targetPathOrFile) {
      return link.original;
    }

    const alias = link.displayText && join(note.parent?.path ?? '', link.displayText) === oldLinkPath ? undefined : link.displayText;

    return generateMarkdownLink(normalizeOptionalProperties<GenerateMarkdownLinkParams>({
      alias,
      app: this.app,
      linkPathStyle: forceRelativePath ? LinkPathStyle.RelativePathToTheSource : LinkPathStyle.ObsidianSettingsDefault,
      originalLink: link.original,
      sourcePathOrFile: note.path,
      subpath,
      targetPathOrFile
    }));
  }

  private async isValidLink(link: Reference, notePath: string): Promise<boolean> {
    const { linkPath, subpath } = splitSubpath(link.link);

    let fullLinkPath: string;

    if (!linkPath) {
      fullLinkPath = notePath;
    } else if (linkPath.startsWith('/')) {
      fullLinkPath = normalizePath(linkPath);
    } else {
      fullLinkPath = join(dirname(notePath), linkPath);
    }

    const file = getFileOrNull({ app: this.app, pathOrFile: fullLinkPath });

    if (!file) {
      return false;
    }

    if (!subpath) {
      return true;
    }

    const ext = file.extension.toLocaleLowerCase();

    if (ext === 'pdf') {
      return subpath.startsWith('#page=');
    }

    if (ext !== MARKDOWN_FILE_EXTENSION) {
      return false;
    }

    const cache = await getCacheSafe(this.app, file);

    if (!cache) {
      return false;
    }

    return !!resolveSubpath(cache, subpath);
  }
}
