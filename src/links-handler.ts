import type {
  Reference,
  ReferenceCache
} from 'obsidian';
import type { FileChange } from 'obsidian-dev-utils/obsidian/FileChange';
import type { GenerateMarkdownLinkOptions } from 'obsidian-dev-utils/obsidian/Link';

import {
  App,
  normalizePath,
  TFile
} from 'obsidian';
import { noop } from 'obsidian-dev-utils/Function';
import { normalizeOptionalProperties } from 'obsidian-dev-utils/Object';
import { applyFileChanges } from 'obsidian-dev-utils/obsidian/FileChange';
import {
  getFileOrNull,
  MARKDOWN_FILE_EXTENSION
} from 'obsidian-dev-utils/obsidian/FileSystem';
import {
  extractLinkFile,
  generateMarkdownLink,
  splitSubpath,
  testWikilink,
  updateLinksInFile
} from 'obsidian-dev-utils/obsidian/Link';
import {
  getAllLinks,
  getBacklinksForFileSafe,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import { referenceToFileChange } from 'obsidian-dev-utils/obsidian/Reference';
import {
  dirname,
  join
} from 'obsidian-dev-utils/Path';
import { trimStart } from 'obsidian-dev-utils/String';

import type { ConsistentAttachmentsAndLinksPlugin } from './ConsistentAttachmentsAndLinksPlugin.ts';

export interface LinksAndEmbedsChangedInfo {
  embeds: ReferenceChangeInfo[];
  links: ReferenceChangeInfo[];
}

export interface PathChangeInfo {
  newPath: string;
  oldPath: string;
}

export interface ReferenceChangeInfo {
  newLink: string;
  old: ReferenceCache;
}

export class ConsistencyCheckResult extends Map<string, ReferenceCache[]> {
  public constructor(private title: string) {
    super();
  }

  public add(notePath: string, link: ReferenceCache): void {
    if (!this.has(notePath)) {
      this.set(notePath, []);
    }
    const arr = this.get(notePath);
    if (arr) {
      arr.push(link);
    }
  }

  public override toString(app: App, reportPath: string): string {
    if (this.size > 0) {
      let str = `# ${this.title} (${this.size.toString()} files)\n`;
      for (const notePath of this.keys()) {
        const note = getFileOrNull(app, notePath);
        if (!note) {
          continue;
        }
        const linkStr = generateMarkdownLink({
          app,
          sourcePathOrFile: reportPath,
          targetPathOrFile: note
        });
        str += `${linkStr}:\n`;
        for (const link of this.get(notePath) ?? []) {
          str += `- (line ${(link.position.start.line + 1).toString()}): \`${link.link}\`\n`;
        }
        str += '\n\n';
      }
      return str;
    }
    return `# ${this.title}\nNo problems found\n\n`;
  }
}

export class LinksHandler {
  public constructor(
    private plugin: ConsistentAttachmentsAndLinksPlugin
  ) {
    noop();
  }

  public async checkConsistency(
    note: TFile,
    badLinks: ConsistencyCheckResult,
    badEmbeds: ConsistencyCheckResult,
    wikiLinks: ConsistencyCheckResult,
    wikiEmbeds: ConsistencyCheckResult
  ): Promise<void> {
    if (this.plugin.settings.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.plugin.app, note.path);
    if (!cache) {
      return;
    }
    const links = cache.links ?? [];
    const embeds = cache.embeds ?? [];

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
  }

  public async convertAllNoteEmbedsPathsToRelative(notePath: string): Promise<ReferenceChangeInfo[]> {
    return await this.convertAllNoteRefPathsToRelative(notePath, true);
  }

  public async convertAllNoteLinksPathsToRelative(notePath: string): Promise<ReferenceChangeInfo[]> {
    return await this.convertAllNoteRefPathsToRelative(notePath, false);
  }

  public async getCachedNotesThatHaveLinkToFile(filePath: string): Promise<string[]> {
    const file = getFileOrNull(this.plugin.app, filePath);
    if (!file) {
      return [];
    }

    const backlinks = await getBacklinksForFileSafe(this.plugin.app, file);
    return backlinks.keys();
  }

  public getFullPathForLink(link: string, owningNotePath: string): string {
    ({ linkPath: link } = splitSubpath(link));
    const parentFolder = dirname(owningNotePath);
    const fullPath = join(parentFolder, link);
    return fullPath;
  }

  public async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string, embedOnlyLinks: boolean): Promise<number> {
    if (this.plugin.settings.isPathIgnored(notePath)) {
      return 0;
    }

    const noteFile = getFileOrNull(this.plugin.app, notePath);
    if (!noteFile) {
      console.warn(`can't update wikilinks in note, file not found: ${notePath}`);
      return 0;
    }

    const cache = await getCacheSafe(this.plugin.app, noteFile);
    if (!cache) {
      return 0;
    }

    const links = (embedOnlyLinks ? cache.embeds : cache.links) ?? [];
    const result = links.filter((link) => testWikilink(link.original)).length;
    await updateLinksInFile({
      app: this.plugin.app,
      newSourcePathOrFile: noteFile,
      shouldForceMarkdownLinks: true,
      shouldUpdateEmbedOnlyLinks: embedOnlyLinks
    });
    return result;
  }

  public async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[]): Promise<void> {
    if (this.plugin.settings.isPathIgnored(notePath)) {
      return;
    }

    const note = getFileOrNull(this.plugin.app, notePath);
    if (!note) {
      console.warn(`can't update links in note, file not found: ${notePath}`);
      return;
    }

    const pathChangeMap = new Map<string, string>();
    for (const change of changedLinks) {
      pathChangeMap.set(change.oldPath, change.newPath);
    }

    await this.updateLinks(note, note.path, pathChangeMap);
  }

  private async convertAllNoteRefPathsToRelative(notePath: string, isEmbed: boolean): Promise<ReferenceChangeInfo[]> {
    if (this.plugin.settings.isPathIgnored(notePath)) {
      return [];
    }

    const note = getFileOrNull(this.plugin.app, notePath);
    if (!note) {
      return [];
    }

    const changedRefs: ReferenceChangeInfo[] = [];

    await applyFileChanges(this.plugin.app, note, async () => {
      const cache = await getCacheSafe(this.plugin.app, note);
      if (!cache) {
        return [];
      }
      const refs = (isEmbed ? cache.embeds : cache.links) ?? [];
      const changes: FileChange[] = [];

      for (const ref of refs) {
        const change = {
          endIndex: ref.position.end.offset,
          newContent: this.convertLink({
            forceRelativePath: true,
            link: ref,
            note,
            oldNotePath: notePath
          }),
          oldContent: ref.original,
          startIndex: ref.position.start.offset
        };
        changes.push(change);
        changedRefs.push({ newLink: change.newContent, old: ref });
      }

      return changes;
    });

    return changedRefs;
  }

  private convertLink({
    forceRelativePath,
    link,
    note,
    oldNotePath,
    pathChangeMap
  }: {
    forceRelativePath?: boolean | undefined;
    link: Reference;
    note: TFile;
    oldNotePath: string;
    pathChangeMap?: Map<string, string> | undefined;
  }): string {
    const { linkPath, subpath } = splitSubpath(link.link);
    const oldLinkPath = extractLinkFile(this.plugin.app, link, oldNotePath)?.path ?? join(dirname(oldNotePath), linkPath);
    const newLinkPath = pathChangeMap
      ? pathChangeMap.get(oldLinkPath)
      : extractLinkFile(this.plugin.app, link, note.path)?.path ?? join(dirname(note.path), linkPath);
    if (!newLinkPath) {
      return link.original;
    }

    const targetPathOrFile = getFileOrNull(this.plugin.app, newLinkPath) ?? getFileOrNull(this.plugin.app, oldLinkPath);

    if (!targetPathOrFile) {
      return link.original;
    }

    const alias = link.displayText && join(note.parent?.path ?? '', link.displayText) === oldLinkPath ? undefined : link.displayText;

    return generateMarkdownLink(normalizeOptionalProperties<GenerateMarkdownLinkOptions>({
      alias,
      app: this.plugin.app,
      originalLink: link.original,
      shouldForceRelativePath: forceRelativePath,
      sourcePathOrFile: note.path,
      subpath,
      targetPathOrFile
    }));
  }

  private async isValidLink(link: ReferenceCache, notePath: string): Promise<boolean> {
    const { linkPath, subpath } = splitSubpath(link.link);

    let fullLinkPath: string;

    if (!linkPath) {
      fullLinkPath = notePath;
    } else if (linkPath.startsWith('/')) {
      fullLinkPath = normalizePath(linkPath);
    } else {
      fullLinkPath = join(dirname(notePath), linkPath);
    }

    const file = getFileOrNull(this.plugin.app, fullLinkPath);

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

    const cache = await getCacheSafe(this.plugin.app, file);

    if (!cache) {
      return false;
    }

    const BLOCK_PREFIX = '#^';
    if (subpath.startsWith(BLOCK_PREFIX)) {
      return Object.keys(cache.blocks ?? {}).includes(trimStart(subpath, BLOCK_PREFIX));
    }

    const HEADING_PREFIX = '#';
    return (cache.headings ?? []).map((h) => h.heading.replaceAll(HEADING_PREFIX, ' ')).includes(trimStart(subpath, HEADING_PREFIX));
  }

  private async updateLinks(note: TFile, oldNotePath: string, pathChangeMap?: Map<string, string>): Promise<void> {
    await applyFileChanges(this.plugin.app, note, async () => {
      const cache = await getCacheSafe(this.plugin.app, note);
      if (!cache) {
        return [];
      }
      const links = getAllLinks(cache);
      return links.map((link) =>
        referenceToFileChange(
          link,
          this.convertLink({
            link,
            note,
            oldNotePath,
            pathChangeMap
          })
        )
      );
    });
  }
}
