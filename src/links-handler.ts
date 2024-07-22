import {
  App,
  normalizePath,
  Notice,
  TFile,
  type EmbedCache,
  type LinkCache,
  type ReferenceCache
} from "obsidian";
import { Utils } from "./utils.ts";
import { path } from "./path.ts";
import {
  basename,
  dirname,
  extname,
  join,
} from "node:path/posix";
import { getCacheSafe } from "./MetadataCache.ts";
import { getMarkdownFilesSorted } from "./Vault.ts";
import { showError } from "./Error.ts";

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

  public override toString(): string {
    if (this.size > 0) {
      let str = `# ${this.title} (${this.size} files)\n`;
      for (const notePath of this.keys()) {
        str += `[${notePath}](${Utils.normalizePathForLink(notePath)}):\n`;
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

export interface EmbedChangeInfo {
  old: EmbedCache,
  newLink: string,
}

export interface LinkChangeInfo {
  old: LinkCache,
  newLink: string,
}

export interface LinksAndEmbedsChangedInfo {
  embeds: EmbedChangeInfo[]
  links: LinkChangeInfo[]
}

export interface LinkSectionInfo {
  hasSection: boolean
  link: string
  section: string
}


//simple regex
// const markdownLinkOrEmbedRegexSimple = /\[(.*?)\]\((.*?)\)/gim
// const markdownLinkRegexSimple = /(?<!\!)\[(.*?)\]\((.*?)\)/gim;
// const markdownEmbedRegexSimple = /\!\[(.*?)\]\((.*?)\)/gim

// const wikiLinkOrEmbedRegexSimple = /\[\[(.*?)\]\]/gim
// const wikiLinkRegexSimple = /(?<!\!)\[\[(.*?)\]\]/gim;
// const wikiEmbedRegexSimple = /\!\[\[(.*?)\]\]/gim

//with escaping \ characters
const markdownLinkOrEmbedRegexG = /(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/gim;
const markdownLinkRegexG = /(?<!\!)(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)(?:#(.*?))?\)/gim;
const markdownEmbedRegexG = /(?<!\\)\!\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/gim;

const wikiLinkOrEmbedRegexG = /(?<!\\)\[\[(.*?)(?<!\\)\]\]/gim;
const wikiLinkRegexG = /(?<!\!)(?<!\\)\[\[(.*?)(?<!\\)\]\]/gim;
const wikiEmbedRegexG = /(?<!\\)\!\[\[(.*?)(?<!\\)\]\]/gim;

const markdownLinkOrEmbedRegex = /(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/im;
const markdownLinkRegex = /(?<!\!)(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/im;

export class LinksHandler {
  public constructor(
    private app: App,
    private consoleLogPrefix: string = "",
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
  ) { }

  public isPathIgnored(path: string): boolean {
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

  public checkIsCorrectMarkdownEmbed(text: string): boolean {
    const elements = text.match(markdownEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  public checkIsCorrectMarkdownLink(text: string): boolean {
    const elements = text.match(markdownLinkRegexG);
    return (elements != null && elements.length > 0);
  }

  public checkIsCorrectMarkdownEmbedOrLink(text: string): boolean {
    const elements = text.match(markdownLinkOrEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  public checkIsCorrectWikiEmbed(text: string): boolean {
    const elements = text.match(wikiEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  public checkIsCorrectWikiLink(text: string): boolean {
    const elements = text.match(wikiLinkRegexG);
    return (elements != null && elements.length > 0);
  }

  public checkIsCorrectWikiEmbedOrLink(text: string): boolean {
    const elements = text.match(wikiLinkOrEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  public getFileByLink(link: string, owningNotePath: string, allowInvalidLink: boolean = true): TFile {
    link = this.splitLinkToPathAndSection(link).link;
    if (allowInvalidLink) {
      return this.app.metadataCache.getFirstLinkpathDest(link, owningNotePath)!;
    }
    const fullPath = this.getFullPathForLink(link, owningNotePath);
    return this.app.vault.getFileByPath(fullPath)!;
  }

  public getFullPathForLink(link: string, owningNotePath: string): string {
    link = this.splitLinkToPathAndSection(link).link;
    link = Utils.normalizePathForFile(link);
    owningNotePath = Utils.normalizePathForFile(owningNotePath);

    const parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
    let fullPath = join(parentFolder, link);

    fullPath = Utils.normalizePathForFile(fullPath);
    return fullPath;
  }

  public async getAllCachedLinksToFile(filePath: string): Promise<Record<string, LinkCache[]>> {
    const allLinks: Record<string, LinkCache[]> = {};
    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Getting all cached links to file ${filePath} # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);

      if (note.path == filePath) {
        continue;
      }

      const links = (await getCacheSafe(this.app, note.path)).links ?? [];

      for (const link of links) {
        const linkFullPath = this.getFullPathForLink(link.link, note.path);
        if (linkFullPath == filePath) {
          this.addToRecord(allLinks, note.path, link);
        }
      }
    }

    notice.hide();

    return allLinks;
  }

  private addToRecord<T>(record: Record<string, T[]>, path: string, value: T): void {
    if (!record[path]) {
      record[path] = [];
    }
    record[path].push(value);
  }

  public async getAllCachedEmbedsToFile(filePath: string): Promise<Record<string, EmbedCache[]>> {
    const allEmbeds: Record<string, EmbedCache[]> = {};
    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Getting all cached embeds to file ${filePath} # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);

      if (note.path == filePath) {
        continue;
      }

      const embeds = (await getCacheSafe(this.app, note.path)).embeds ?? [];

      for (const embed of embeds) {
        const linkFullPath = this.getFullPathForLink(embed.link, note.path);
        if (linkFullPath == filePath) {
          this.addToRecord(allEmbeds, note.path, embed);
        }
      }
    }

    notice.hide();

    return allEmbeds;
  }

  private async isValidLink(link: ReferenceCache, notePath: string): Promise<boolean> {
    const [linkPath = "", section = "", otherHashParts] = link.link.split("#");

    if (otherHashParts) {
      return false;
    }

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

    if (!section) {
      return true;
    }

    const ext = extname(file.path).toLowerCase();

    if (ext === ".pdf") {
      return section.startsWith("page=");
    }

    if (ext !== ".md") {
      return false;
    }

    const cache = await getCacheSafe(this.app, file);

    if (section.startsWith("^")) {
      return Object.keys(cache.blocks ?? {}).includes(section.slice(1));
    } else {
      return (cache.headings ?? []).map(h => h.heading.replaceAll("#", " ")).includes(section);
    }
  }

  public async getAllGoodLinks(): Promise<Record<string, LinkCache[]>> {
    const allLinks: Record<string, LinkCache[]> = {};
    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Getting good links # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const links = (await getCacheSafe(this.app, note.path)).links ?? [];

      for (const link of links) {
        if (link.link.startsWith("#")) {
          //internal section link
          continue;
        }

        if (this.checkIsCorrectWikiLink(link.original)) {
          continue;
        }

        const file = this.getFileByLink(link.link, note.path);
        if (file) {
          this.addToRecord(allLinks, note.path, link);
        }
      }
    }

    notice.hide();

    return allLinks;
  }

  public async getAllGoodEmbeds(): Promise<Record<string, EmbedCache[]>> {
    const allEmbeds: Record<string, EmbedCache[]> = {};
    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Getting good embeds # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const embeds = (await getCacheSafe(this.app, note.path)).embeds ?? [];

      for (const embed of embeds) {
        if (this.checkIsCorrectWikiEmbed(embed.original)) {
          continue;
        }

        const file = this.getFileByLink(embed.link, note.path);
        if (file) {
          this.addToRecord(allEmbeds, note.path, embed);
        }
      }
    }

    notice.hide();
    return allEmbeds;
  }

  public async updateLinksToRenamedFile(oldNotePath: string, newNotePath: string, changeLinksAlt = false): Promise<void> {
    if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath)) {
      return;
    }

    const notes = this.getCachedNotesThatHaveLinkToFile(oldNotePath);
    const links: PathChangeInfo[] = [{ oldPath: oldNotePath, newPath: newNotePath }];

    if (notes) {
      for (const note of notes) {
        await this.updateChangedPathsInNote(note, links, changeLinksAlt);
      }
    }
  }

  public async updateChangedPathInNote(notePath: string, oldLink: string, newLink: string, changeLinksAlt = false): Promise<void> {
    if (this.isPathIgnored(notePath)) {
      return;
    }

    const changes: PathChangeInfo[] = [{ oldPath: oldLink, newPath: newLink }];
    return await this.updateChangedPathsInNote(notePath, changes, changeLinksAlt);
  }

  public async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[], changeLinksAlt = false): Promise<void> {
    if (this.isPathIgnored(notePath)) {
      return;
    }

    const file = this.app.vault.getFileByPath(notePath);
    if (!file) {
      showError(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
      return;
    }

    let text = await this.app.vault.read(file);
    let dirty = false;

    const elements = text.match(markdownLinkOrEmbedRegexG);
    if (elements != null && elements.length > 0) {
      for (const el of elements) {
        let alt = el.match(markdownLinkOrEmbedRegex)![1];
        let link = el.match(markdownLinkOrEmbedRegex)![2]!;
        const li = this.splitLinkToPathAndSection(link);

        if (li.hasSection) {
          // for links with sections like [](note.md#section)
          link = li.link;
        }

        const fullLink = this.getFullPathForLink(link, notePath);

        for (const changedLink of changedLinks) {
          if (fullLink == changedLink.oldPath) {
            let newRelLink: string = path.relative(notePath, changedLink.newPath);
            newRelLink = Utils.normalizePathForLink(newRelLink);

            if (newRelLink.startsWith("../")) {
              newRelLink = newRelLink.substring(3);
            }

            if (changeLinksAlt && newRelLink.endsWith(".md")) {
              //rename only if old alt == old note name
              if (alt === basename(changedLink.oldPath, extname(changedLink.oldPath))) {
                const ext = extname(newRelLink);
                const baseName = basename(newRelLink, ext);
                alt = Utils.normalizePathForFile(baseName);
              }
            }

            if (li.hasSection) {
              text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + "#" + li.section + ")");
            } else {
              text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + ")");
            }

            dirty = true;

            console.log(this.consoleLogPrefix + "link updated in cached note [note, old link, new link]: \n   "
              + file.path + "\n   " + link + "\n   " + newRelLink);
          }
        }
      }
    }

    if (dirty) {
      await this.app.vault.modify(file, text);
    }
  }

  public async updateInternalLinksInMovedNote(oldNotePath: string, newNotePath: string, attachmentsAlreadyMoved: boolean): Promise<void> {
    if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath)) {
      return;
    }

    const file = this.app.vault.getFileByPath(newNotePath);
    if (!file) {
      showError(this.consoleLogPrefix + "can't update internal links, file not found: " + newNotePath);
      return;
    }

    let text = await this.app.vault.read(file);
    let dirty = false;

    const elements = text.match(markdownLinkOrEmbedRegexG);
    if (elements != null && elements.length > 0) {
      for (const el of elements) {
        const alt = el.match(markdownLinkOrEmbedRegex)![1];
        let link = el.match(markdownLinkOrEmbedRegex)![2]!;
        const li = this.splitLinkToPathAndSection(link);

        if (link.startsWith("#")) {
          //internal section link
          continue;
        }

        if (li.hasSection) {
          // for links with sections like [](note.md#section)
          link = li.link;
        }


        //startsWith("../") - for not skipping files that not in the note dir
        if (attachmentsAlreadyMoved && !link.endsWith(".md") && !link.startsWith("../")) {
          continue;
        }

        let file = this.getFileByLink(link, oldNotePath);
        if (!file) {
          file = this.getFileByLink(link, newNotePath);
          if (!file) {
            showError(this.consoleLogPrefix + newNotePath + " has bad link (file does not exist): " + link);
            continue;
          }
        }

        let newRelLink: string = path.relative(newNotePath, file.path);
        newRelLink = Utils.normalizePathForLink(newRelLink);

        if (newRelLink.startsWith("../")) {
          newRelLink = newRelLink.substring(3);
        }

        if (li.hasSection) {
          text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + "#" + li.section + ")");
        } else {
          text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + ")");
        }

        dirty = true;

        console.log(this.consoleLogPrefix + "link updated in moved note [note, old link, new link]: \n   "
          + file.path + "\n   " + link + "   \n" + newRelLink);
      }
    }

    if (dirty) {
      await this.app.vault.modify(file, text);
    }
  }

  public getCachedNotesThatHaveLinkToFile(filePath: string): string[] {
    const file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      return [];
    }
    const backlinks = this.app.metadataCache.getBacklinksForFile(file);
    return backlinks.keys();
  }

  public splitLinkToPathAndSection(link: string): LinkSectionInfo {
    let res: LinkSectionInfo = {
      hasSection: false,
      link: link,
      section: ""
    };

    if (!link.contains("#")) {
      return res;
    }


    const linkBeforeHash = link.match(/(.*?)#(.*?)$/)![1]!;
    const section = link.match(/(.*?)#(.*?)$/)![2]!;

    const isMarkdownSection = section != "" && linkBeforeHash.endsWith(".md"); // for links with sections like [](note.md#section)
    const isPdfPageSection = section.startsWith("page=") && linkBeforeHash.endsWith(".pdf"); // for links with sections like [](note.pdf#page=42)

    if (isMarkdownSection || isPdfPageSection) {
      res = {
        hasSection: true,
        link: linkBeforeHash,
        section: section
      };
    }

    return res;
  }

  public getFilePathWithRenamedBaseName(filePath: string, newBaseName: string): string {
    return Utils.normalizePathForFile(join(dirname(filePath), newBaseName + extname(filePath)));
  }

  public async getLinksFromNote(notePath: string): Promise<LinkCache[]> {
    const file = this.app.vault.getFileByPath(notePath);
    if (!file) {
      showError(this.consoleLogPrefix + "can't get embeds, file not found: " + notePath);
      return [];
    }

    const text = await this.app.vault.read(file);

    const links: LinkCache[] = [];

    const elements = text.match(markdownLinkOrEmbedRegexG);
    if (elements != null && elements.length > 0) {
      for (const el of elements) {
        const alt = el.match(markdownLinkOrEmbedRegex)![1]!;
        const link = el.match(markdownLinkOrEmbedRegex)![2]!;

        const emb: LinkCache = {
          link: link,
          displayText: alt,
          original: el,
          position: {
            start: {
              col: 0,//todo
              line: 0,
              offset: 0
            },
            end: {
              col: 0,//todo
              line: 0,
              offset: 0
            }
          }
        };

        links.push(emb);
      }
    }
    return links;
  }

  public async convertAllNoteEmbedsPathsToRelative(notePath: string): Promise<EmbedChangeInfo[]> {
    if (this.isPathIgnored(notePath)) {
      return [];
    }
    const changedEmbeds: EmbedChangeInfo[] = [];

    const embeds = (await getCacheSafe(this.app, notePath)).embeds ?? [];

    for (const embed of embeds) {
      const isMarkdownEmbed = this.checkIsCorrectMarkdownEmbed(embed.original);
      const isWikiEmbed = this.checkIsCorrectWikiEmbed(embed.original);
      if (isMarkdownEmbed || isWikiEmbed) {
        let file = this.getFileByLink(embed.link, notePath);
        if (file) {
          continue;
        }

        file = this.app.metadataCache.getFirstLinkpathDest(embed.link, notePath)!;
        if (file) {
          let newRelLink: string = path.relative(notePath, file.path);
          newRelLink = isMarkdownEmbed ? Utils.normalizePathForLink(newRelLink) : Utils.normalizePathForFile(newRelLink);

          if (newRelLink.startsWith("../")) {
            newRelLink = newRelLink.substring(3);
          }

          changedEmbeds.push({ old: embed, newLink: newRelLink });
        } else {
          showError(this.consoleLogPrefix + notePath + " has bad embed (file does not exist): " + embed.link);
        }
      } else {
        showError(this.consoleLogPrefix + notePath + " has bad embed (format of link is not markdown or wiki link): " + embed.original);
      }
    }

    await this.updateChangedEmbedInNote(notePath, changedEmbeds);
    return changedEmbeds;
  }

  public async convertAllNoteLinksPathsToRelative(notePath: string): Promise<LinkChangeInfo[]> {
    if (this.isPathIgnored(notePath)) {
      return [];
    }

    const changedLinks: LinkChangeInfo[] = [];

    const links = (await getCacheSafe(this.app, notePath)).links ?? [];

    for (const link of links) {
      const isMarkdownLink = this.checkIsCorrectMarkdownLink(link.original);
      const isWikiLink = this.checkIsCorrectWikiLink(link.original);
      if (isMarkdownLink || isWikiLink) {
        if (link.link.startsWith("#")) {
          //internal section link
          continue;
        }

        let file = this.getFileByLink(link.link, notePath);
        if (file) {
          continue;
        }

        //!!! link.displayText is always "" - OBSIDIAN BUG?, so get display text manually
        if (isMarkdownLink) {
          const elements = link.original.match(markdownLinkRegex);
          if (elements) {
            link.displayText = elements[1]!;
          }
        }

        file = this.app.metadataCache.getFirstLinkpathDest(link.link, notePath)!;
        if (file) {
          let newRelLink: string = path.relative(notePath, file.path);
          newRelLink = isMarkdownLink ? Utils.normalizePathForLink(newRelLink) : Utils.normalizePathForFile(newRelLink);

          if (newRelLink.startsWith("../")) {
            newRelLink = newRelLink.substring(3);
          }

          changedLinks.push({ old: link, newLink: newRelLink });
        } else {
          showError(this.consoleLogPrefix + notePath + " has bad link (file does not exist): " + link.link);
        }
      } else {
        showError(this.consoleLogPrefix + notePath + " has bad link (format of link is not markdown or wiki link): " + link.original);
      }
    }

    await this.updateChangedLinkInNote(notePath, changedLinks);
    return changedLinks;
  }

  public async updateChangedEmbedInNote(notePath: string, changedEmbeds: EmbedChangeInfo[]): Promise<void> {
    if (this.isPathIgnored(notePath)) {
      return;
    }

    const noteFile = this.app.vault.getFileByPath(notePath);
    if (!noteFile) {
      showError(this.consoleLogPrefix + "can't update embeds in note, file not found: " + notePath);
      return;
    }

    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    if (changedEmbeds && changedEmbeds.length > 0) {
      for (const embed of changedEmbeds) {
        if (embed.old.link == embed.newLink) {
          continue;
        }

        if (this.checkIsCorrectMarkdownEmbed(embed.old.original)) {
          text = text.replace(embed.old.original, "![" + embed.old.displayText + "]" + "(" + embed.newLink + ")");
        } else if (this.checkIsCorrectWikiEmbed(embed.old.original)) {
          text = text.replace(embed.old.original, "![[" + embed.newLink + "]]");
        } else {
          showError(this.consoleLogPrefix + notePath + " has bad embed (format of link is not markdown or wikilink): " + embed.old.original);
          continue;
        }

        console.log(this.consoleLogPrefix + "embed updated in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + embed.old.link + "\n   " + embed.newLink);

        dirty = true;
      }
    }

    if (dirty) {
      await this.app.vault.modify(noteFile, text);
    }
  }

  public async updateChangedLinkInNote(notePath: string, changedLinks: LinkChangeInfo[]): Promise<void> {
    if (this.isPathIgnored(notePath)) {
      return;
    }

    const noteFile = this.app.vault.getFileByPath(notePath);
    if (!noteFile) {
      showError(this.consoleLogPrefix + "can't update links in note, file not found: " + notePath);
      return;
    }

    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    if (changedLinks && changedLinks.length > 0) {
      for (const link of changedLinks) {
        if (link.old.link == link.newLink) {
          continue;
        }

        if (this.checkIsCorrectMarkdownLink(link.old.original)) {
          text = text.replace(link.old.original, "[" + link.old.displayText + "]" + "(" + link.newLink + ")");
        } else if (this.checkIsCorrectWikiLink(link.old.original)) {
          text = text.replace(link.old.original, "[[" + link.newLink + "]]");
        } else {
          showError(this.consoleLogPrefix + notePath + " has bad link (format of link is not markdown or wikilink): " + link.old.original);
          continue;
        }

        console.log(this.consoleLogPrefix + "cached link updated in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + link.old.link + "\n   " + link.newLink);

        dirty = true;
      }
    }

    if (dirty) {
      await this.app.vault.modify(noteFile, text);
    }
  }

  public async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string): Promise<LinksAndEmbedsChangedInfo> {
    if (this.isPathIgnored(notePath)) {
      return { embeds: [], links: [] };
    }
    const res: LinksAndEmbedsChangedInfo = {
      links: [],
      embeds: [],
    };

    const noteFile = this.app.vault.getFileByPath(notePath);
    if (!noteFile) {
      showError(this.consoleLogPrefix + "can't update wikilinks in note, file not found: " + notePath);
      return { embeds: [], links: [] };
    }

    const cache = await getCacheSafe(this.app, notePath);
    const links = cache.links ?? [];
    const embeds = cache.embeds ?? [];
    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    for (const embed of embeds) {
      if (this.checkIsCorrectWikiEmbed(embed.original)) {

        const newPath = Utils.normalizePathForLink(embed.link);
        const newLink = "![" + "]" + "(" + newPath + ")";
        text = text.replace(embed.original, newLink);

        console.log(this.consoleLogPrefix + "wiki link (embed) replaced in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + embed.original + "\n   " + newLink);

        res.embeds.push({ old: embed, newLink: newLink });

        dirty = true;
      }
    }

    for (const link of links) {
      if (this.checkIsCorrectWikiLink(link.original)) {
        let newPath = Utils.normalizePathForLink(link.link);

        const file = this.app.metadataCache.getFirstLinkpathDest(link.link, notePath);
        if (file && file.extension == "md" && !newPath.endsWith(".md")) {
          newPath = newPath + ".md";
        }

        const newLink = "[" + link.displayText + "]" + "(" + newPath + ")";
        text = text.replace(link.original, newLink);

        console.log(this.consoleLogPrefix + "wiki link replaced in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + link.original + "\n   " + newLink);

        res.links.push({ old: link, newLink: newLink });

        dirty = true;
      }
    }

    if (dirty) {
      await this.app.vault.modify(noteFile, text);
    }

    return res;
  }

  public async checkConsistency(note: TFile, badLinks: ConsistencyCheckResult, badEmbeds: ConsistencyCheckResult, wikiLinks: ConsistencyCheckResult, wikiEmbeds: ConsistencyCheckResult): Promise<void> {
    if (this.isPathIgnored(note.path)) {
      return;
    }

    const cache = await getCacheSafe(this.app, note.path);
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
}
