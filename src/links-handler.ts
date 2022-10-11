import { App, TAbstractFile, TFile, EmbedCache, LinkCache, Pos } from 'obsidian';
import { Utils } from './utils';
import { path } from './path';

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
const markdownLinkOrEmbedRegexG = /(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/gim
const markdownLinkRegexG = /(?<!\!)(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)(?:#(.*?))?\)/gim;
const markdownEmbedRegexG = /(?<!\\)\!\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/gim

const wikiLinkOrEmbedRegexG = /(?<!\\)\[\[(.*?)(?<!\\)\]\]/gim
const wikiLinkRegexG = /(?<!\!)(?<!\\)\[\[(.*?)(?<!\\)\]\]/gim;
const wikiEmbedRegexG = /(?<!\\)\!\[\[(.*?)(?<!\\)\]\]/gim

const markdownLinkOrEmbedRegex = /(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/im
const markdownLinkRegex = /(?<!\!)(?<!\\)\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/im;
const markdownEmbedRegex = /(?<!\\)\!\[(.*?)(?<!\\)\]\((.*?)(?<!\\)\)/im

const wikiLinkOrEmbedRegex = /(?<!\\)\[\[(.*?)(?<!\\)\]\]/im
const wikiLinkRegex = /(?<!\!)(?<!\\)\[\[(.*?)(?<!\\)\]\]/im;
const wikiEmbedRegex = /(?<!\\)\!\[\[(.*?)(?<!\\)\]\]/im


export class LinksHandler {

	constructor(
		private app: App,
		private consoleLogPrefix: string = "",
		private ignoreFolders: string[] = [],
		private ignoreFiles: string[] = [],
	) { }

	isPathIgnored(path: string): boolean {
		if (path.startsWith("./"))
			path = path.substring(2);

		for (let folder of this.ignoreFolders) {
			if (path.startsWith(folder)) {
				return true;
			}
		}

		for (let file of this.ignoreFiles) {
			if (path == file) {
				return true;
			}
		}
	}

	checkIsCorrectMarkdownEmbed(text: string) {
		let elements = text.match(markdownEmbedRegexG);
		return (elements != null && elements.length > 0)
	}

	checkIsCorrectMarkdownLink(text: string) {
		let elements = text.match(markdownLinkRegexG);
		return (elements != null && elements.length > 0)
	}

	checkIsCorrectMarkdownEmbedOrLink(text: string) {
		let elements = text.match(markdownLinkOrEmbedRegexG);
		return (elements != null && elements.length > 0)
	}

	checkIsCorrectWikiEmbed(text: string) {
		let elements = text.match(wikiEmbedRegexG);
		return (elements != null && elements.length > 0)
	}

	checkIsCorrectWikiLink(text: string) {
		let elements = text.match(wikiLinkRegexG);
		return (elements != null && elements.length > 0)
	}

	checkIsCorrectWikiEmbedOrLink(text: string) {
		let elements = text.match(wikiLinkOrEmbedRegexG);
		return (elements != null && elements.length > 0)
	}


	getFileByLink(link: string, owningNotePath: string): TFile {
		return this.app.metadataCache.getFirstLinkpathDest(link, owningNotePath);
	}


	getFileByPath(path: string): TFile {
		path = Utils.normalizePathForFile(path);
		let files = this.app.vault.getFiles();
		let file = files.find(file => Utils.normalizePathForFile(file.path) === path);
		return file;
	}


	getFullPathForLink(link: string, owningNotePath: string): string {
		link = this.splitLinkToPathAndSection(link).link;
		link = Utils.normalizePathForFile(link);
		owningNotePath = Utils.normalizePathForFile(owningNotePath);

		let parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
		let fullPath = path.join(parentFolder, link);

		fullPath = Utils.normalizePathForFile(fullPath);
		return fullPath;
	}


	getAllCachedLinksToFile(filePath: string): { [notePath: string]: LinkCache[]; } {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (note.path == filePath)
					continue;

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(note.path)?.links;

				if (links) {
					for (let link of links) {
						let linkFullPath = this.getFullPathForLink(link.link, note.path);
						if (linkFullPath == filePath) {
							if (!allLinks[note.path])
								allLinks[note.path] = [];
							allLinks[note.path].push(link);
						}
					}
				}
			}
		}

		return allLinks;
	}


	getAllCachedEmbedsToFile(filePath: string): { [notePath: string]: EmbedCache[]; } {
		let allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (note.path == filePath)
					continue;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(note.path)?.embeds;

				if (embeds) {
					for (let embed of embeds) {
						let linkFullPath = this.getFullPathForLink(embed.link, note.path);
						if (linkFullPath == filePath) {
							if (!allEmbeds[note.path])
								allEmbeds[note.path] = [];
							allEmbeds[note.path].push(embed);
						}
					}
				}
			}
		}

		return allEmbeds;
	}



	getAllBadLinks(): { [notePath: string]: LinkCache[]; } {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(note.path)?.links;

				if (links) {
					for (let link of links) {
						if (link.link.startsWith("#")) //internal section link
							continue;

						if (this.checkIsCorrectWikiLink(link.original))
							continue;

						let file = this.getFileByLink(link.link, note.path);
						if (!file) {
							if (!allLinks[note.path])
								allLinks[note.path] = [];
							allLinks[note.path].push(link);
						}
					}
				}
			}
		}

		return allLinks;
	}

	getAllBadEmbeds(): { [notePath: string]: EmbedCache[]; } {
		let allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(note.path)?.embeds;

				if (embeds) {
					for (let embed of embeds) {
						if (this.checkIsCorrectWikiEmbed(embed.original))
							continue;

						let file = this.getFileByLink(embed.link, note.path);
						if (!file) {
							if (!allEmbeds[note.path])
								allEmbeds[note.path] = [];
							allEmbeds[note.path].push(embed);
						}
					}
				}
			}
		}

		return allEmbeds;
	}


	getAllGoodLinks(): { [notePath: string]: LinkCache[]; } {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(note.path)?.links;

				if (links) {
					for (let link of links) {
						if (link.link.startsWith("#")) //internal section link
							continue;

						if (this.checkIsCorrectWikiLink(link.original))
							continue;

						let file = this.getFileByLink(link.link, note.path);
						if (file) {
							if (!allLinks[note.path])
								allLinks[note.path] = [];
							allLinks[note.path].push(link);
						}
					}
				}
			}
		}

		return allLinks;
	}

	async getAllBadSectionLinks(): Promise<{ [notePath: string]: LinkCache[]; }> {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(note.path)?.links;
				if (links) {
					for (let link of links) {
						if (this.checkIsCorrectWikiLink(link.original))
							continue;

						let li = this.splitLinkToPathAndSection(link.link);
						if (!li.hasSection)
							continue;

						let file = this.getFileByLink(link.link, note.path);
						if (file) {
							if (file.extension === "pdf" && li.section.startsWith("page=")) {
								continue;
							}

							let text = await this.app.vault.read(file);
							let section = Utils.normalizeLinkSection(li.section);

							if (section.startsWith("^")) //skip ^ links
								continue;

							let regex = /[ !@$%^&*()-=_+\\/;'\[\]\"\|\?.\,\<\>\`\~\{\}]/gim;
							text = text.replace(regex, '');
							section = section.replace(regex, '');

							if (!text.contains("#" + section)) {
								if (!allLinks[note.path])
									allLinks[note.path] = [];
								allLinks[note.path].push(link);
							}
						}
					}
				}
			}
		}

		return allLinks;
	}

	getAllGoodEmbeds(): { [notePath: string]: EmbedCache[]; } {
		let allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(note.path)?.embeds;

				if (embeds) {
					for (let embed of embeds) {
						if (this.checkIsCorrectWikiEmbed(embed.original))
							continue;

						let file = this.getFileByLink(embed.link, note.path);
						if (file) {
							if (!allEmbeds[note.path])
								allEmbeds[note.path] = [];
							allEmbeds[note.path].push(embed);
						}
					}
				}
			}
		}

		return allEmbeds;
	}

	getAllWikiLinks(): { [notePath: string]: LinkCache[]; } {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(note.path)?.links;

				if (links) {
					for (let link of links) {
						if (!this.checkIsCorrectWikiLink(link.original))
							continue;

						if (!allLinks[note.path])
							allLinks[note.path] = [];
						allLinks[note.path].push(link);

					}
				}
			}
		}

		return allLinks;
	}

	getAllWikiEmbeds(): { [notePath: string]: EmbedCache[]; } {
		let allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(note.path)?.embeds;

				if (embeds) {
					for (let embed of embeds) {
						if (!this.checkIsCorrectWikiEmbed(embed.original))
							continue;

						if (!allEmbeds[note.path])
							allEmbeds[note.path] = [];
						allEmbeds[note.path].push(embed);
					}
				}
			}
		}

		return allEmbeds;
	}


	async updateLinksToRenamedFile(oldNotePath: string, newNotePath: string, changelinksAlt = false, useBuiltInObsidianLinkCaching = false) {
		if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath))
			return;

		let notes = useBuiltInObsidianLinkCaching ? this.getCachedNotesThatHaveLinkToFile(oldNotePath) : await this.getNotesThatHaveLinkToFile(oldNotePath);
		let links: PathChangeInfo[] = [{ oldPath: oldNotePath, newPath: newNotePath }];

		if (notes) {
			for (let note of notes) {
				await this.updateChangedPathsInNote(note, links, changelinksAlt);
			}
		}
	}


	async updateChangedPathInNote(notePath: string, oldLink: string, newLink: string, changelinksAlt = false) {
		if (this.isPathIgnored(notePath))
			return;

		let changes: PathChangeInfo[] = [{ oldPath: oldLink, newPath: newLink }];
		return await this.updateChangedPathsInNote(notePath, changes, changelinksAlt);
	}


	async updateChangedPathsInNote(notePath: string, changedLinks: PathChangeInfo[], changelinksAlt = false) {
		if (this.isPathIgnored(notePath))
			return;

		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = text.match(markdownLinkOrEmbedRegexG);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(markdownLinkOrEmbedRegex)[1];
				let link = el.match(markdownLinkOrEmbedRegex)[2];
				let li = this.splitLinkToPathAndSection(link);

				if (li.hasSection)  // for links with sections like [](note.md#section)
					link = li.link;

				let fullLink = this.getFullPathForLink(link, notePath);

				for (let changedLink of changedLinks) {
					if (fullLink == changedLink.oldPath) {
						let newRelLink: string = path.relative(notePath, changedLink.newPath);
						newRelLink = Utils.normalizePathForLink(newRelLink);

						if (newRelLink.startsWith("../")) {
							newRelLink = newRelLink.substring(3);
						}

						if (changelinksAlt && newRelLink.endsWith(".md")) {
							//rename only if old alt == old note name
							if (alt === path.basename(changedLink.oldPath, path.extname(changedLink.oldPath))) {
								let ext = path.extname(newRelLink);
								let baseName = path.basename(newRelLink, ext);
								alt = Utils.normalizePathForFile(baseName);
							}
						}

						if (li.hasSection)
							text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + '#' + li.section + ')');
						else
							text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')');

						dirty = true;

						console.log(this.consoleLogPrefix + "link updated in cached note [note, old link, new link]: \n   "
							+ file.path + "\n   " + link + "\n   " + newRelLink)
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

		let file = this.getFileByPath(newNotePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant update internal links, file not found: " + newNotePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = text.match(markdownLinkOrEmbedRegexG);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(markdownLinkOrEmbedRegex)[1];
				let link = el.match(markdownLinkOrEmbedRegex)[2];
				let li = this.splitLinkToPathAndSection(link);

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
					text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + '#' + li.section + ')');
				else
					text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')');

				dirty = true;

				console.log(this.consoleLogPrefix + "link updated in moved note [note, old link, new link]: \n   "
					+ file.path + "\n   " + link + "   \n" + newRelLink);
			}
		}

		if (dirty)
			await this.app.vault.modify(file, text);
	}


	getCachedNotesThatHaveLinkToFile(filePath: string): string[] {
		let notes: string[] = [];
		let allNotes = this.app.vault.getMarkdownFiles();

		if (allNotes) {
			for (let note of allNotes) {
				if (this.isPathIgnored(note.path))
					continue;

				let notePath = note.path;
				if (note.path == filePath)
					continue;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
				if (embeds) {
					for (let embed of embeds) {
						let linkPath = this.getFullPathForLink(embed.link, note.path);
						if (linkPath == filePath) {
							if (!notes.contains(notePath))
								notes.push(notePath);
						}
					}
				}

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(notePath)?.links;
				if (links) {
					for (let link of links) {
						let linkPath = this.getFullPathForLink(link.link, note.path);
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
		let notes: string[] = [];
		let allNotes = this.app.vault.getMarkdownFiles();

		if (allNotes) {
			for (let note of allNotes) {
				if (this.isPathIgnored(note.path))
					continue;

				let notePath = note.path;
				if (notePath == filePath)
					continue;

				let links = await this.getLinksFromNote(notePath);
				for (let link of links) {
					let li = this.splitLinkToPathAndSection(link.link);
					let linkFullPath = this.getFullPathForLink(li.link, notePath);
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
		}

		if (!link.contains('#'))
			return res;


		let linkBeforeHash = link.match(/(.*?)#(.*?)$/)[1];
		let section = link.match(/(.*?)#(.*?)$/)[2];

		let isMarkdownSection = section != "" && linkBeforeHash.endsWith(".md"); // for links with sections like [](note.md#section)
		let isPdfPageSection = section.startsWith("page=") && linkBeforeHash.endsWith(".pdf"); // for links with sections like [](note.pdf#page=42)

		if (isMarkdownSection || isPdfPageSection) {
			res = {
				hasSection: true,
				link: linkBeforeHash,
				section: section
			}
		}

		return res;
	}


	getFilePathWithRenamedBaseName(filePath: string, newBaseName: string): string {
		return Utils.normalizePathForFile(path.join(path.dirname(filePath), newBaseName + path.extname(filePath)));
	}


	async getLinksFromNote(notePath: string): Promise<LinkCache[]> {
		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant get embeds, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);

		let links: LinkCache[] = [];

		let elements = text.match(markdownLinkOrEmbedRegexG);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(markdownLinkOrEmbedRegex)[1];
				let link = el.match(markdownLinkOrEmbedRegex)[2];

				let emb: LinkCache = {
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
		if (this.isPathIgnored(notePath))
			return;

		let changedEmbeds: EmbedChangeInfo[] = [];

		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;

		if (embeds) {
			for (let embed of embeds) {
				let isMarkdownEmbed = this.checkIsCorrectMarkdownEmbed(embed.original);
				let isWikiEmbed = this.checkIsCorrectWikiEmbed(embed.original);
				if (isMarkdownEmbed || isWikiEmbed) {
					let file = this.getFileByLink(embed.link, notePath);
					if (file)
						continue;

					file = this.app.metadataCache.getFirstLinkpathDest(embed.link, notePath);
					if (file) {
						let newRelLink: string = path.relative(notePath, file.path);
						newRelLink = isMarkdownEmbed ? Utils.normalizePathForLink(newRelLink) : Utils.normalizePathForFile(newRelLink);

						if (newRelLink.startsWith("../")) {
							newRelLink = newRelLink.substring(3);
						}

						changedEmbeds.push({ old: embed, newLink: newRelLink })
					} else {
						console.error(this.consoleLogPrefix + notePath + " has bad embed (file does not exist): " + embed.link);
					}
				} else {
					console.error(this.consoleLogPrefix + notePath + " has bad embed (format of link is not markdown or wikilink): " + embed.original);
				}
			}
		}

		await this.updateChangedEmbedInNote(notePath, changedEmbeds);
		return changedEmbeds;
	}


	async convertAllNoteLinksPathsToRelative(notePath: string): Promise<LinkChangeInfo[]> {
		if (this.isPathIgnored(notePath))
			return;

		let changedLinks: LinkChangeInfo[] = [];

		let links = this.app.metadataCache.getCache(notePath)?.links;

		if (links) {
			for (let link of links) {
				let isMarkdownLink = this.checkIsCorrectMarkdownLink(link.original);
				let isWikiLink = this.checkIsCorrectWikiLink(link.original);
				if (isMarkdownLink || isWikiLink) {
					if (link.link.startsWith("#")) //internal section link
						continue;

					let file = this.getFileByLink(link.link, notePath);
					if (file)
						continue;

					//!!! link.displayText is always "" - OBSIDIAN BUG?, so get display text manualy
					if (isMarkdownLink) {
						let elements = link.original.match(markdownLinkRegex);
						if (elements)
							link.displayText = elements[1];
					}

					file = this.app.metadataCache.getFirstLinkpathDest(link.link, notePath);
					if (file) {
						let newRelLink: string = path.relative(notePath, file.path);
						newRelLink = isMarkdownLink ? Utils.normalizePathForLink(newRelLink) : Utils.normalizePathForFile(newRelLink);

						if (newRelLink.startsWith("../")) {
							newRelLink = newRelLink.substring(3);
						}

						changedLinks.push({ old: link, newLink: newRelLink })
					} else {
						console.error(this.consoleLogPrefix + notePath + " has bad link (file does not exist): " + link.link);
					}
				} else {
					console.error(this.consoleLogPrefix + notePath + " has bad link (format of link is not markdown or wikilink): " + link.original);
				}
			}
		}

		await this.updateChangedLinkInNote(notePath, changedLinks);
		return changedLinks;
	}


	async updateChangedEmbedInNote(notePath: string, changedEmbeds: EmbedChangeInfo[]) {
		if (this.isPathIgnored(notePath))
			return;

		let noteFile = this.getFileByPath(notePath);
		if (!noteFile) {
			console.error(this.consoleLogPrefix + "cant update embeds in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(noteFile);
		let dirty = false;

		if (changedEmbeds && changedEmbeds.length > 0) {
			for (let embed of changedEmbeds) {
				if (embed.old.link == embed.newLink)
					continue;

				if (this.checkIsCorrectMarkdownEmbed(embed.old.original)) {
					text = text.replace(embed.old.original, '![' + embed.old.displayText + ']' + '(' + embed.newLink + ')');
				} else if (this.checkIsCorrectWikiEmbed(embed.old.original)) {
					text = text.replace(embed.old.original, '![[' + embed.newLink + ']]');
				} else {
					console.error(this.consoleLogPrefix + notePath + " has bad embed (format of link is not maekdown or wikilink): " + embed.old.original);
					continue;
				}

				console.log(this.consoleLogPrefix + "embed updated in note [note, old link, new link]: \n   "
					+ noteFile.path + "\n   " + embed.old.link + "\n   " + embed.newLink)

				dirty = true;
			}
		}

		if (dirty)
			await this.app.vault.modify(noteFile, text);
	}


	async updateChangedLinkInNote(notePath: string, chandedLinks: LinkChangeInfo[]) {
		if (this.isPathIgnored(notePath))
			return;

		let noteFile = this.getFileByPath(notePath);
		if (!noteFile) {
			console.error(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(noteFile);
		let dirty = false;

		if (chandedLinks && chandedLinks.length > 0) {
			for (let link of chandedLinks) {
				if (link.old.link == link.newLink)
					continue;

				if (this.checkIsCorrectMarkdownLink(link.old.original)) {
					text = text.replace(link.old.original, '[' + link.old.displayText + ']' + '(' + link.newLink + ')');
				} else if (this.checkIsCorrectWikiLink(link.old.original)) {
					text = text.replace(link.old.original, '[[' + link.newLink + ']]');
				} else {
					console.error(this.consoleLogPrefix + notePath + " has bad link (format of link is not maekdown or wikilink): " + link.old.original);
					continue;
				}

				console.log(this.consoleLogPrefix + "cached link updated in note [note, old link, new link]: \n   "
					+ noteFile.path + "\n   " + link.old.link + "\n   " + link.newLink)

				dirty = true;
			}
		}

		if (dirty)
			await this.app.vault.modify(noteFile, text);
	}


	async replaceAllNoteWikilinksWithMarkdownLinks(notePath: string): Promise<LinksAndEmbedsChangedInfo> {
		if (this.isPathIgnored(notePath))
			return;

		let res: LinksAndEmbedsChangedInfo = {
			links: [],
			embeds: [],
		}

		let noteFile = this.getFileByPath(notePath);
		if (!noteFile) {
			console.error(this.consoleLogPrefix + "cant update wikilinks in note, file not found: " + notePath);
			return;
		}

		let links = this.app.metadataCache.getCache(notePath)?.links;
		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
		let text = await this.app.vault.read(noteFile);
		let dirty = false;

		if (embeds) { //embeds must go first!
			for (let embed of embeds) {
				if (this.checkIsCorrectWikiEmbed(embed.original)) {

					let newPath = Utils.normalizePathForLink(embed.link)
					let newLink = '![' + ']' + '(' + newPath + ')'
					text = text.replace(embed.original, newLink);

					console.log(this.consoleLogPrefix + "wikilink (embed) replaced in note [note, old link, new link]: \n   "
						+ noteFile.path + "\n   " + embed.original + "\n   " + newLink)

					res.embeds.push({ old: embed, newLink: newLink })

					dirty = true;
				}
			}
		}

		if (links) {
			for (let link of links) {
				if (this.checkIsCorrectWikiLink(link.original)) {
					let newPath = Utils.normalizePathForLink(link.link)

					let file = this.app.metadataCache.getFirstLinkpathDest(link.link, notePath);
					if (file && file.extension == "md" && !newPath.endsWith(".md"))
						newPath = newPath + ".md";

					let newLink = '[' + link.displayText + ']' + '(' + newPath + ')'
					text = text.replace(link.original, newLink);

					console.log(this.consoleLogPrefix + "wikilink replaced in note [note, old link, new link]: \n   "
						+ noteFile.path + "\n   " + link.original + "\n   " + newLink)

					res.links.push({ old: link, newLink: newLink })

					dirty = true;
				}
			}
		}

		if (dirty)
			await this.app.vault.modify(noteFile, text);

		return res;
	}
}