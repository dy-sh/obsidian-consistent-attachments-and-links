import {
  App,
  normalizePath,
  TFile,
  type ReferenceCache
} from "obsidian";
import { posix } from "@jinder/path";
const {
  dirname,
  join
} = posix;
import {
  getAllLinks,
  getBacklinksForFileSafe,
  getCacheSafe
} from "./MetadataCache.ts";
import {
  applyFileChanges,
  type FileChange
} from "./Vault.ts";
import {
  splitSubpath,
  updateLinksInFile
} from "./Link.ts";
import { generateMarkdownLink } from "./GenerateMarkdownLink.ts";

export class ConsistencyCheckResult extends Map<string, ReferenceCache[]> {
  public constructor(private title: string) {
    super();
  }

  public add(notePath: string, link: ReferenceCache): void {
    if (!this.has(notePath)) {
      this.set(notePath, []);
    }
    this.get(notePath)!.push(link);
  }

  public override toString(app: App, reportPath: string): string {
    if (this.size > 0) {
      let str = `# ${this.title} (${this.size} files)\n`;
      for (const notePath of this.keys()) {
        const linkStr = app.fileManager.generateMarkdownLink(app.vault.getFileByPath(notePath)!, reportPath);
        str += `${linkStr}:\n`;
        for (const link of this.get(notePath)!) {
          str += `- (line ${link.position.start.line + 1}): \`${link.link}\`\n`;
        }
        str += "\n\n";
      }
      return str;
    } else {
      return `# ${this.title}\nNo problems found\n\n`;
    }
  }
}

export interface PathChangeInfo {
  oldPath: string,
  newPath: string,
}

export interface ReferenceChangeInfo {
  old: ReferenceCache,
  newLink: string,
}

export interface LinksAndEmbedsChangedInfo {
  embeds: ReferenceChangeInfo[]
  links: ReferenceChangeInfo[]
}

export class LinksHandler {
  public constructor(
    private app: App,
    private consoleLogPrefix: string = "",
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
  ) { }

  private isPathIgnored(path: string): boolean {
    if (path.startsWith("./")) {
      path = path.substring(2);
    }

    for (const folder of this.ignoreFolders) {
      if (path.startsWith(folder)) {
        return true;
      }
    }

    for (const fileRegex of this.ignoreFilesRegex) {
      if (fileRegex.test(path)) {
        return true;
      }
    }

    return false;
  }

  public getFileByLink(link: string, owningNotePath: string, allowInvalidLink: boolean = true): TFile {
    ({ linkPath: link } = splitSubpath(link));
    if (allowInvalidLink) {
      return this.app.metadataCache.getFirstLinkpathDest(link, owningNotePath)!;
    }
    const fullPath = this.getFullPathForLink(link, owningNotePath);
    return this.app.vault.getFileByPath(fullPath)!;
  }

  public getFullPathForLink(link: string, owningNotePath: string): string {
    ({ linkPath: link } = splitSubpath(link));
    const parentFolder = dirname(owningNotePath);
    const fullPath = join(parentFolder, link);
    return fullPath;
  }

  private async isValidLink(link: ReferenceCache, notePath: string): Promise<boolean> {
    const { linkPath, subpath } = splitSubpath(link.link);

    let fullLinkPath: string;

    if (!linkPath) {
      fullLinkPath = notePath;
    } else if (linkPath.startsWith("/")) {
      fullLinkPath = normalizePath(linkPath);
    } else {
      fullLinkPath = join(dirname(notePath), linkPath);
    }

    const file = this.app.vault.getFileByPath(fullLinkPath);

    if (!file) {
      return false;
    }

    if (!subpath) {
      return true;
    }

    const ext = file.extension.toLocaleLowerCase();

    if (ext === "pdf") {
      return subpath.startsWith("#page=");
    }

    if (ext !== "md") {
      return false;
    }

    const cache = await getCacheSafe(this.app, file);

    if (!cache) {
      return false;
    }

    if (subpath.startsWith("#^")) {
      return Object.keys(cache.blocks ?? {}).includes(subpath.slice(2));
    } else {
      return (cache.headings ?? []).map(h => h.heading.replaceAll("#", " ")).includes(subpath.slice(1));
    }
  }

  public async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[], changeLinksAlt = false): Promise<void> {
    if (this.isPathIgnored(notePath)) {
      return;
    }

    const note = this.app.vault.getFileByPath(notePath);
    if (!note) {
      console.warn(this.consoleLogPrefix + "can't update links in note, file not found: " + notePath);
      return;
    }

    const pathChangeMap = new Map<string, string>();
    for (const change of changedLinks) {
      pathChangeMap.set(change.oldPath, change.newPath);
    }

    await this.updateLinks(note, note.path, pathChangeMap, changeLinksAlt);
  }

  private convertLink({
    note,
    link,
    oldNotePath,
    pathChangeMap,
    changeLinksAlt,
    isEmbed,
    isWikilink,
    isRelative
  }:
  {
    note: TFile,
    link: ReferenceCache,
    oldNotePath: string,
    pathChangeMap?: Map<string, string> | undefined,
    changeLinksAlt?: boolean | undefined,
    isEmbed?: boolean | undefined,
    isWikilink?: boolean | undefined,
    isRelative?: boolean | undefined
  }): string {
    const { linkPath, subpath } = splitSubpath(link.link);
    const oldLinkPath = join(dirname(oldNotePath), linkPath);
    const newLinkPath = pathChangeMap ? pathChangeMap.get(oldLinkPath) : join(dirname(note.path), linkPath);
    if (!newLinkPath) {
      return link.original;
    }

    const newLinkedNote = this.app.vault.getFileByPath(oldLinkPath) ?? this.app.vault.getFileByPath(newLinkPath);

    if (!newLinkedNote) {
      return link.original;
    }

    return generateMarkdownLink({
      app: this.app,
      file: newLinkedNote,
      sourcePath: note.path,
      subpath,
      alias: changeLinksAlt === false ? link.displayText : undefined,
      isEmbed,
      isWikilink,
      isRelative
    });
  }

  public async getCachedNotesThatHaveLinkToFile(filePath: string): Promise<string[]> {
    const file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      return [];
    }

    const backlinks = await getBacklinksForFileSafe(this.app, file);
    return backlinks.keys();
  }

  public async convertAllNoteEmbedsPathsToRelative(notePath: string): Promise<ReferenceChangeInfo[]> {
    return this.convertAllNoteRefPathsToRelative(notePath, true);
  }

  private async convertAllNoteRefPathsToRelative(notePath: string, isEmbed: boolean): Promise<ReferenceChangeInfo[]> {
    if (this.isPathIgnored(notePath)) {
      return [];
    }

    const note = this.app.vault.getFileByPath(notePath);
    if (!note) {
      return [];
    }

    const changedRefs: ReferenceChangeInfo[] = [];

    await applyFileChanges(this.app, note, async () => {
      const cache = await getCacheSafe(this.app, note);
      if (!cache) {
        return [];
      }
      const refs = (isEmbed ? cache.embeds : cache.links) ?? [];
      const changes: FileChange[] = [];

      for (const ref of refs) {
        const change = {
          startIndex: ref.position.start.offset,
          endIndex: ref.position.end.offset,
          oldContent: ref.original,
          newContent: this.convertLink({
            note,
            link: ref,
            oldNotePath: notePath,
            isWikilink: ref.original.includes("[["),
            isRelative: true
          })
        };
        changes.push(change);
        changedRefs.push({ old: ref, newLink: change.newContent });
      }

      return changes;
    });

    return changedRefs;
  }

  public async convertAllNoteLinksPathsToRelative(notePath: string): Promise<ReferenceChangeInfo[]> {
    return this.convertAllNoteRefPathsToRelative(notePath, false);
  }

  public async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string): Promise<number> {
    if (this.isPathIgnored(notePath)) {
      return 0;
    }

    const noteFile = this.app.vault.getFileByPath(notePath);
    if (!noteFile) {
      console.warn(this.consoleLogPrefix + "can't update wikilinks in note, file not found: " + notePath);
      return 0;
    }

    const cache = await getCacheSafe(this.app, noteFile);
    if (!cache) {
      return 0;
    }

    const links = getAllLinks(cache);
    const result = links.filter(link => link.original.includes("[[")).length;
    await updateLinksInFile(this.app, noteFile, noteFile.path, new Map<string, string>(), true);
    return result;
  }

  public async checkConsistency(note: TFile, badLinks: ConsistencyCheckResult, badEmbeds: ConsistencyCheckResult, wikiLinks: ConsistencyCheckResult, wikiEmbeds: ConsistencyCheckResult): Promise<void> {
    if (this.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.app, note.path);
    if (!cache) {
      return;
    }
    const links = cache.links ?? [];
    const embeds = cache.embeds ?? [];

    for (const link of links) {
      if (!(await this.isValidLink(link, note.path))) {
        badLinks.add(note.path, link);
      }

      if (link.original.includes("[[")) {
        wikiLinks.add(note.path, link);
      }
    }

    for (const embed of embeds) {
      if (!(await this.isValidLink(embed, note.path))) {
        badEmbeds.add(note.path, embed);
      }

      if (embed.original.includes("[[")) {
        wikiEmbeds.add(note.path, embed);
      }
    }
  }

  private async updateLinks(note: TFile, oldNotePath: string, pathChangeMap?: Map<string, string>, changeLinksAlt?: boolean): Promise<void> {
    await applyFileChanges(this.app, note, async () => {
      const cache = await getCacheSafe(this.app, note);
      if (!cache) {
        return [];
      }
      const links = getAllLinks(cache);
      return links.map(link => ({
        startIndex: link.position.start.offset,
        endIndex: link.position.end.offset,
        oldContent: link.original,
        newContent: this.convertLink({
          note,
          link,
          oldNotePath,
          pathChangeMap,
          changeLinksAlt
        })
      }));
    });
  }
}
