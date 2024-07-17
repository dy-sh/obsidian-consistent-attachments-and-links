import {
  App,
  TFile,
  type EmbedCache,
  type LinkCache
} from "obsidian";
import { Utils } from "./utils.ts";
import { path } from "./path.ts";

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

  constructor(
    private app: App,
    private consoleLogPrefix: string = "",
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
  ) { }

  isPathIgnored(path: string): boolean {
    if (path.startsWith("./"))
      path = path.substring(2);

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

  checkIsCorrectMarkdownEmbed(text: string) {
    const elements = text.match(markdownEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  checkIsCorrectMarkdownLink(text: string) {
    const elements = text.match(markdownLinkRegexG);
    return (elements != null && elements.length > 0);
  }

  checkIsCorrectMarkdownEmbedOrLink(text: string) {
    const elements = text.match(markdownLinkOrEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  checkIsCorrectWikiEmbed(text: string) {
    const elements = text.match(wikiEmbedRegexG);
    return (elements != null && elements.length > 0);
  }

  checkIsCorrectWikiLink(text: string) {
    const elements = text.match(wikiLinkRegexG);
    return (elements != null && elements.length > 0);
  }

  checkIsCorrectWikiEmbedOrLink(text: string) {
    const elements = text.match(wikiLinkOrEmbedRegexG);
    return (elements != null && elements.length > 0);
  }


  getFileByLink(link: string, owningNotePath: string, allowInvalidLink: boolean = true): TFile {
    link = this.splitLinkToPathAndSection(link).link;
    if (allowInvalidLink) {
      return this.app.metadataCache.getFirstLinkpathDest(link, owningNotePath)!;
    }
    const fullPath = this.getFullPathForLink(link, owningNotePath);
    return this.getFileByPath(fullPath);
  }


  getFileByPath(path: string): TFile {
    path = Utils.normalizePathForFile(path);
    return this.app.vault.getAbstractFileByPath(path) as TFile;
  }


  getFullPathForLink(link: string, owningNotePath: string): string {
    link = this.splitLinkToPathAndSection(link).link;
    link = Utils.normalizePathForFile(link);
    owningNotePath = Utils.normalizePathForFile(owningNotePath);

    const parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
    let fullPath = path.join(parentFolder, link);

    fullPath = Utils.normalizePathForFile(fullPath);
    return fullPath;
  }


  async getAllCachedLinksToFile(filePath: string): Promise<{ [notePath: string]: LinkCache[]; }> {
    const allLinks: { [notePath: string]: LinkCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (note.path == filePath)
          continue;

        const links = (await Utils.getCacheSafe(note.path)).links;

        if (links) {
          for (const link of links) {
            const linkFullPath = this.getFullPathForLink(link.link, note.path);
            if (linkFullPath == filePath) {
              if (!allLinks[note.path])
                allLinks[note.path] = [];
              allLinks[note.path]!.push(link);
            }
          }
        }
      }
    }

    return allLinks;
  }


  async getAllCachedEmbedsToFile(filePath: string): Promise<{ [notePath: string]: EmbedCache[]; }> {
    const allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (note.path == filePath)
          continue;

        //!!! this can return undefined if note was just updated
        const embeds = (await Utils.getCacheSafe(note.path)).embeds;

        if (embeds) {
          for (const embed of embeds) {
            const linkFullPath = this.getFullPathForLink(embed.link, note.path);
            if (linkFullPath == filePath) {
              if (!allEmbeds[note.path])
                allEmbeds[note.path] = [];
              allEmbeds[note.path]!.push(embed);
            }
          }
        }
      }
    }

    return allEmbeds;
  }



  async getAllBadLinks(): Promise<{ [notePath: string]: LinkCache[]; }> {
    const allLinks: { [notePath: string]: LinkCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const links = (await Utils.getCacheSafe(note.path)).links;

        if (links) {
          for (const link of links) {
            if (link.link.startsWith("#")) //internal section link
              continue;

            if (this.checkIsCorrectWikiLink(link.original))
              continue;

            const file = this.getFileByLink(link.link, note.path, false);
            if (!file) {
              if (!allLinks[note.path])
                allLinks[note.path] = [];
              allLinks[note.path]!.push(link);
            }
          }
        }
      }
    }

    return allLinks;
  }

  async getAllBadEmbeds(): Promise<{ [notePath: string]: EmbedCache[]; }> {
    const allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const embeds = (await Utils.getCacheSafe(note.path)).embeds;

        if (embeds) {
          for (const embed of embeds) {
            if (this.checkIsCorrectWikiEmbed(embed.original))
              continue;

            const file = this.getFileByLink(embed.link, note.path, false);
            if (!file) {
              if (!allEmbeds[note.path])
                allEmbeds[note.path] = [];
              allEmbeds[note.path]!.push(embed);
            }
          }
        }
      }
    }

    return allEmbeds;
  }


  async getAllGoodLinks(): Promise<{ [notePath: string]: LinkCache[]; }> {
    const allLinks: { [notePath: string]: LinkCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const links = (await Utils.getCacheSafe(note.path)).links;

        if (links) {
          for (const link of links) {
            if (link.link.startsWith("#")) //internal section link
              continue;

            if (this.checkIsCorrectWikiLink(link.original))
              continue;

            const file = this.getFileByLink(link.link, note.path);
            if (file) {
              if (!allLinks[note.path])
                allLinks[note.path] = [];
              allLinks[note.path]!.push(link);
            }
          }
        }
      }
    }

    return allLinks;
  }

  async getAllBadSectionLinks(): Promise<{ [notePath: string]: LinkCache[]; }> {
    const allLinks: { [notePath: string]: LinkCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const links = (await Utils.getCacheSafe(note.path)).links;
        if (links) {
          for (const link of links) {
            if (this.checkIsCorrectWikiLink(link.original))
              continue;

            const li = this.splitLinkToPathAndSection(link.link);
            if (!li.hasSection)
              continue;

            const file = this.getFileByLink(link.link, note.path, false);
            if (file) {
              if (file.extension === "pdf" && li.section.startsWith("page=")) {
                continue;
              }

              let text = await this.app.vault.read(file);
              let section = Utils.normalizeLinkSection(li.section);

              if (section.startsWith("^")) //skip ^ links
                continue;

              const regex = /[ !@$%^&*()-=_+\\/;'\[\]\"\|\?.\,\<\>\`\~\{\}]/gim;
              text = text.replace(regex, "");
              section = section.replace(regex, "");

              if (!text.contains("#" + section)) {
                if (!allLinks[note.path])
                  allLinks[note.path] = [];
                allLinks[note.path]!.push(link);
              }
            }
          }
        }
      }
    }

    return allLinks;
  }

  async getAllGoodEmbeds(): Promise<{ [notePath: string]: EmbedCache[]; }> {
    const allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const embeds = (await Utils.getCacheSafe(note.path)).embeds;

        if (embeds) {
          for (const embed of embeds) {
            if (this.checkIsCorrectWikiEmbed(embed.original))
              continue;

            const file = this.getFileByLink(embed.link, note.path);
            if (file) {
              if (!allEmbeds[note.path])
                allEmbeds[note.path] = [];
              allEmbeds[note.path]!.push(embed);
            }
          }
        }
      }
    }

    return allEmbeds;
  }

  async getAllWikiLinks(): Promise<{ [notePath: string]: LinkCache[]; }> {
    const allLinks: { [notePath: string]: LinkCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const links = (await Utils.getCacheSafe(note.path)).links;

        if (links) {
          for (const link of links) {
            if (!this.checkIsCorrectWikiLink(link.original))
              continue;

            if (!allLinks[note.path])
              allLinks[note.path] = [];
            allLinks[note.path]!.push(link);

          }
        }
      }
    }

    return allLinks;
  }

  async getAllWikiEmbeds(): Promise<{ [notePath: string]: EmbedCache[]; }> {
    const allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
    const notes = this.app.vault.getMarkdownFiles();

    if (notes) {
      for (const note of notes) {
        if (this.isPathIgnored(note.path))
          continue;

        //!!! this can return undefined if note was just updated
        const embeds = (await Utils.getCacheSafe(note.path)).embeds;

        if (embeds) {
          for (const embed of embeds) {
            if (!this.checkIsCorrectWikiEmbed(embed.original))
              continue;

            if (!allEmbeds[note.path])
              allEmbeds[note.path] = [];
            allEmbeds[note.path]!.push(embed);
          }
        }
      }
    }

    return allEmbeds;
  }


  async updateLinksToRenamedFile(oldNotePath: string, newNotePath: string, changeLinksAlt = false, useBuiltInObsidianLinkCaching = false) {
    if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath))
      return;

    const notes = useBuiltInObsidianLinkCaching ? await this.getCachedNotesThatHaveLinkToFile(oldNotePath) : await this.getNotesThatHaveLinkToFile(oldNotePath);
    const links: PathChangeInfo[] = [{ oldPath: oldNotePath, newPath: newNotePath }];

    if (notes) {
      for (const note of notes) {
        await this.updateChangedPathsInNote(note, links, changeLinksAlt);
      }
    }
  }


  async updateChangedPathInNote(notePath: string, oldLink: string, newLink: string, changeLinksAlt = false) {
    if (this.isPathIgnored(notePath))
      return;

    const changes: PathChangeInfo[] = [{ oldPath: oldLink, newPath: newLink }];
    return await this.updateChangedPathsInNote(notePath, changes, changeLinksAlt);
  }


  async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[], changeLinksAlt = false) {
    if (this.isPathIgnored(notePath))
      return;

    const file = this.getFileByPath(notePath);
    if (!file) {
      console.error(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
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

        if (li.hasSection)  // for links with sections like [](note.md#section)
          link = li.link;

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
              if (alt === path.basename(changedLink.oldPath, path.extname(changedLink.oldPath))) {
                const ext = path.extname(newRelLink);
                const baseName = path.basename(newRelLink, ext);
                alt = Utils.normalizePathForFile(baseName);
              }
            }

            if (li.hasSection)
              text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + "#" + li.section + ")");
            else
              text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + ")");

            dirty = true;

            console.log(this.consoleLogPrefix + "link updated in cached note [note, old link, new link]: \n   "
              + file.path + "\n   " + link + "\n   " + newRelLink);
          }
        }
      }
    }

    if (dirty)
      await this.app.vault.modify(file, text);
  }


  async updateInternalLinksInMovedNote(oldNotePath: string, newNotePath: string, attachmentsAlreadyMoved: boolean) {
    if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath))
      return;

    const file = this.getFileByPath(newNotePath);
    if (!file) {
      console.error(this.consoleLogPrefix + "can't update internal links, file not found: " + newNotePath);
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

        if (link.startsWith("#")) //internal section link
          continue;

        if (li.hasSection)  // for links with sections like [](note.md#section)
          link = li.link;


        //startsWith("../") - for not skipping files that not in the note dir
        if (attachmentsAlreadyMoved && !link.endsWith(".md") && !link.startsWith("../"))
          continue;

        let file = this.getFileByLink(link, oldNotePath);
        if (!file) {
          file = this.getFileByLink(link, newNotePath);
          if (!file) {
            console.error(this.consoleLogPrefix + newNotePath + " has bad link (file does not exist): " + link);
            continue;
          }
        }


        let newRelLink: string = path.relative(newNotePath, file.path);
        newRelLink = Utils.normalizePathForLink(newRelLink);

        if (newRelLink.startsWith("../")) {
          newRelLink = newRelLink.substring(3);
        }

        if (li.hasSection)
          text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + "#" + li.section + ")");
        else
          text = text.replace(el, "[" + alt + "]" + "(" + newRelLink + ")");

        dirty = true;

        console.log(this.consoleLogPrefix + "link updated in moved note [note, old link, new link]: \n   "
          + file.path + "\n   " + link + "   \n" + newRelLink);
      }
    }

    if (dirty)
      await this.app.vault.modify(file, text);
  }


  async getCachedNotesThatHaveLinkToFile(filePath: string): Promise<string[]> {
    const notes: string[] = [];
    const allNotes = this.app.vault.getMarkdownFiles();

    if (allNotes) {
      for (const note of allNotes) {
        if (this.isPathIgnored(note.path))
          continue;

        const notePath = note.path;
        if (note.path == filePath)
          continue;

        //!!! this can return undefined if note was just updated
        const embeds = (await Utils.getCacheSafe(notePath)).embeds;
        if (embeds) {
          for (const embed of embeds) {
            const linkPath = this.getFullPathForLink(embed.link, note.path);
            if (linkPath == filePath) {
              if (!notes.contains(notePath))
                notes.push(notePath);
            }
          }
        }

        //!!! this can return undefined if note was just updated
        const links = (await Utils.getCacheSafe(notePath)).links;
        if (links) {
          for (const link of links) {
            const linkPath = this.getFullPathForLink(link.link, note.path);
            if (linkPath == filePath) {
              if (!notes.contains(notePath))
                notes.push(notePath);
            }
          }
        }
      }
    }

    return notes;
  }


  async getNotesThatHaveLinkToFile(filePath: string): Promise<string[]> {
    const notes: string[] = [];
    const allNotes = this.app.vault.getMarkdownFiles();

    if (allNotes) {
      for (const note of allNotes) {
        if (this.isPathIgnored(note.path))
          continue;

        const notePath = note.path;
        if (notePath == filePath)
          continue;

        const links = await this.getLinksFromNote(notePath);
        for (const link of links) {
          const li = this.splitLinkToPathAndSection(link.link);
          const linkFullPath = this.getFullPathForLink(li.link, notePath);
          if (linkFullPath == filePath) {
            if (!notes.contains(notePath))
              notes.push(notePath);
          }
        }
      }
    }

    return notes;
  }

  splitLinkToPathAndSection(link: string): LinkSectionInfo {
    let res: LinkSectionInfo = {
      hasSection: false,
      link: link,
      section: ""
    };

    if (!link.contains("#"))
      return res;


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


  getFilePathWithRenamedBaseName(filePath: string, newBaseName: string): string {
    return Utils.normalizePathForFile(path.join(path.dirname(filePath), newBaseName + path.extname(filePath)));
  }


  async getLinksFromNote(notePath: string): Promise<LinkCache[]> {
    const file = this.getFileByPath(notePath);
    if (!file) {
      console.error(this.consoleLogPrefix + "can't get embeds, file not found: " + notePath);
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




  async convertAllNoteEmbedsPathsToRelative(notePath: string): Promise<EmbedChangeInfo[]> {
    if (this.isPathIgnored(notePath)) {
      return [];
    }
    const changedEmbeds: EmbedChangeInfo[] = [];

    const embeds = (await Utils.getCacheSafe(notePath)).embeds;

    if (embeds) {
      for (const embed of embeds) {
        const isMarkdownEmbed = this.checkIsCorrectMarkdownEmbed(embed.original);
        const isWikiEmbed = this.checkIsCorrectWikiEmbed(embed.original);
        if (isMarkdownEmbed || isWikiEmbed) {
          let file = this.getFileByLink(embed.link, notePath);
          if (file)
            continue;

          file = this.app.metadataCache.getFirstLinkpathDest(embed.link, notePath)!;
          if (file) {
            let newRelLink: string = path.relative(notePath, file.path);
            newRelLink = isMarkdownEmbed ? Utils.normalizePathForLink(newRelLink) : Utils.normalizePathForFile(newRelLink);

            if (newRelLink.startsWith("../")) {
              newRelLink = newRelLink.substring(3);
            }

            changedEmbeds.push({ old: embed, newLink: newRelLink });
          } else {
            console.error(this.consoleLogPrefix + notePath + " has bad embed (file does not exist): " + embed.link);
          }
        } else {
          console.error(this.consoleLogPrefix + notePath + " has bad embed (format of link is not markdown or wiki link): " + embed.original);
        }
      }
    }

    await this.updateChangedEmbedInNote(notePath, changedEmbeds);
    return changedEmbeds;
  }


  async convertAllNoteLinksPathsToRelative(notePath: string): Promise<LinkChangeInfo[]> {
    if (this.isPathIgnored(notePath))
      return [];

    const changedLinks: LinkChangeInfo[] = [];

    const links = (await Utils.getCacheSafe(notePath)).links;

    if (links) {
      for (const link of links) {
        const isMarkdownLink = this.checkIsCorrectMarkdownLink(link.original);
        const isWikiLink = this.checkIsCorrectWikiLink(link.original);
        if (isMarkdownLink || isWikiLink) {
          if (link.link.startsWith("#")) //internal section link
            continue;

          let file = this.getFileByLink(link.link, notePath);
          if (file)
            continue;

          //!!! link.displayText is always "" - OBSIDIAN BUG?, so get display text manually
          if (isMarkdownLink) {
            const elements = link.original.match(markdownLinkRegex);
            if (elements)
              link.displayText = elements[1];
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
            console.error(this.consoleLogPrefix + notePath + " has bad link (file does not exist): " + link.link);
          }
        } else {
          console.error(this.consoleLogPrefix + notePath + " has bad link (format of link is not markdown or wiki link): " + link.original);
        }
      }
    }

    await this.updateChangedLinkInNote(notePath, changedLinks);
    return changedLinks;
  }


  async updateChangedEmbedInNote(notePath: string, changedEmbeds: EmbedChangeInfo[]) {
    if (this.isPathIgnored(notePath))
      return;

    const noteFile = this.getFileByPath(notePath);
    if (!noteFile) {
      console.error(this.consoleLogPrefix + "can't update embeds in note, file not found: " + notePath);
      return;
    }

    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    if (changedEmbeds && changedEmbeds.length > 0) {
      for (const embed of changedEmbeds) {
        if (embed.old.link == embed.newLink)
          continue;

        if (this.checkIsCorrectMarkdownEmbed(embed.old.original)) {
          text = text.replace(embed.old.original, "![" + embed.old.displayText + "]" + "(" + embed.newLink + ")");
        } else if (this.checkIsCorrectWikiEmbed(embed.old.original)) {
          text = text.replace(embed.old.original, "![[" + embed.newLink + "]]");
        } else {
          console.error(this.consoleLogPrefix + notePath + " has bad embed (format of link is not markdown or wikilink): " + embed.old.original);
          continue;
        }

        console.log(this.consoleLogPrefix + "embed updated in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + embed.old.link + "\n   " + embed.newLink);

        dirty = true;
      }
    }

    if (dirty)
      await this.app.vault.modify(noteFile, text);
  }


  async updateChangedLinkInNote(notePath: string, changedLinks: LinkChangeInfo[]) {
    if (this.isPathIgnored(notePath))
      return;

    const noteFile = this.getFileByPath(notePath);
    if (!noteFile) {
      console.error(this.consoleLogPrefix + "can't update links in note, file not found: " + notePath);
      return;
    }

    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    if (changedLinks && changedLinks.length > 0) {
      for (const link of changedLinks) {
        if (link.old.link == link.newLink)
          continue;

        if (this.checkIsCorrectMarkdownLink(link.old.original)) {
          text = text.replace(link.old.original, "[" + link.old.displayText + "]" + "(" + link.newLink + ")");
        } else if (this.checkIsCorrectWikiLink(link.old.original)) {
          text = text.replace(link.old.original, "[[" + link.newLink + "]]");
        } else {
          console.error(this.consoleLogPrefix + notePath + " has bad link (format of link is not markdown or wikilink): " + link.old.original);
          continue;
        }

        console.log(this.consoleLogPrefix + "cached link updated in note [note, old link, new link]: \n   "
          + noteFile.path + "\n   " + link.old.link + "\n   " + link.newLink);

        dirty = true;
      }
    }

    if (dirty)
      await this.app.vault.modify(noteFile, text);
  }


  async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string): Promise<LinksAndEmbedsChangedInfo> {
    if (this.isPathIgnored(notePath)) {
      return { embeds: [], links: [] };
    }
    const res: LinksAndEmbedsChangedInfo = {
      links: [],
      embeds: [],
    };

    const noteFile = this.getFileByPath(notePath);
    if (!noteFile) {
      console.error(this.consoleLogPrefix + "can't update wikilinks in note, file not found: " + notePath);
      return { embeds: [], links: [] };
    }

    const cache = await Utils.getCacheSafe(notePath);
    const links = cache.links;
    const embeds = cache.embeds;
    let text = await this.app.vault.read(noteFile);
    let dirty = false;

    if (embeds) { //embeds must go first!
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
    }

    if (links) {
      for (const link of links) {
        if (this.checkIsCorrectWikiLink(link.original)) {
          let newPath = Utils.normalizePathForLink(link.link);

          const file = this.app.metadataCache.getFirstLinkpathDest(link.link, notePath);
          if (file && file.extension == "md" && !newPath.endsWith(".md"))
            newPath = newPath + ".md";

          const newLink = "[" + link.displayText + "]" + "(" + newPath + ")";
          text = text.replace(link.original, newLink);

          console.log(this.consoleLogPrefix + "wiki link replaced in note [note, old link, new link]: \n   "
            + noteFile.path + "\n   " + link.original + "\n   " + newLink);

          res.links.push({ old: link, newLink: newLink });

          dirty = true;
        }
      }
    }

    if (dirty)
      await this.app.vault.modify(noteFile, text);

    return res;
  }
}
