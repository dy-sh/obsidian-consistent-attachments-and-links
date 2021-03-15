import { App, TAbstractFile, TFile, EmbedCache, LinkCache } from 'obsidian';
import { Utils } from './utils';

const path = require('path');

export interface LinkChangeInfo {
	oldPath: string,
	newPath: string
}

const markdownLinkRegex = /\[(.*?)\]\((.*?)(?=\"|\))(\".*?\")?\)/g;

export class LinksHandler {

	constructor(
		private app: App,
		private consoleLogPrefix: string = ""
	) { }

	getFileByLink(link: string, owningNotePath: string): TFile {
		let fullPath = this.getFullPathForLink(link, owningNotePath);
		let file = this.getFileByPath(fullPath);
		return file;
	}

	getFileByPath(path: string): TFile {
		path = Utils.normalizePathForFile(path);
		let files = this.app.vault.getFiles();
		let file = files.find(file => Utils.normalizePathForFile(file.path) === path);
		return file;
	}

	getFullPathForLink(link: string, owningNotePath: string) {
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


	async updateLinksToRenamedFile(oldNotePath: string, newNotePath: string, changelinksAlt = false) {
		let notes = await this.getNotesThatHaveLinkToFile(oldNotePath);
		let links: LinkChangeInfo[] = [{ oldPath: oldNotePath, newPath: newNotePath }];

		if (notes) {
			for (let note of notes) {
				await this.updateChangedLinksInNote(note, links, changelinksAlt);
			}
		}
	}

	async updateChangedLinkInNote(notePath: string, oldLink: string, newLink: string, changelinksAlt = false) {
		let changes: LinkChangeInfo[] = [{ oldPath: oldLink, newPath: newLink }];
		return await this.updateChangedLinksInNote(notePath, changes, changelinksAlt);
	}

	async updateChangedLinksInNote(notePath: string, changedLinks: LinkChangeInfo[], changelinksAlt = false) {
		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant update links in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = text.match(markdownLinkRegex);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

				let fullLink = this.getFullPathForLink(link, notePath);

				for (let changedLink of changedLinks) {
					if (fullLink == changedLink.oldPath) {
						let newRelLink: string = path.relative(notePath, changedLink.newPath);
						newRelLink = Utils.normalizePathForLink(newRelLink);

						if (newRelLink.startsWith("../")) {
							newRelLink = newRelLink.substring(3);
						}

						if (changelinksAlt && newRelLink.endsWith(".md")) {
							let ext = path.extname(newRelLink);
							let baseName = path.basename(newRelLink, ext);
							alt = Utils.normalizePathForFile(baseName);
						}

						text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')')

						dirty = true;

						console.log(this.consoleLogPrefix + "link updated in note [note, old link, new link]: \n   "
							+ file.path + "\n   " + link + "\n   " + newRelLink)
					}
				}
			}
		}

		if (dirty)
			await this.app.vault.modify(file, text);
	}





	async updateInternalLinksInMovedNote(oldNotePath: string, newNotePath: string, attachmentsAlreadyMoved: boolean) {
		let file = this.getFileByPath(newNotePath);
		if (!file) {
			console.error(this.consoleLogPrefix + "cant update internal links, file not found: " + newNotePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = text.match(/\[.*?\)/g);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

				//startsWith("../") - for not skipping files that not in the note dir
				if (attachmentsAlreadyMoved && !link.endsWith(".md") && !link.startsWith("../"))
					continue;

				let fullLink = this.getFullPathForLink(link, oldNotePath);
				let newRelLink: string = path.relative(newNotePath, fullLink);
				newRelLink = Utils.normalizePathForLink(newRelLink);

				if (newRelLink.startsWith("../")) {
					newRelLink = newRelLink.substring(3);
				}

				text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')');

				dirty = true;

				console.log(this.consoleLogPrefix + "link updated in note [note, old link, new link]: \n   "
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
				let notePath = note.path;

				//!!! this can return undefined if note was just updated
				let embeds = this.app.metadataCache.getCache(notePath)?.embeds;

				if (embeds) {
					for (let embed of embeds) {
						let linkFullPath = this.getFullPathForLink(embed.link, notePath);
						if (linkFullPath == filePath) {
							if (!notes.contains(notePath))
								notes.push(notePath);
						}
					}
				}

				//!!! this can return undefined if note was just updated
				let links = this.app.metadataCache.getCache(notePath)?.links;

				if (links) {
					for (let link of links) {
						let linkFullPath = this.getFullPathForLink(link.link, notePath);
						if (linkFullPath == filePath) {
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
				let notePath = note.path;

				let links = await this.getLinksFromNote(notePath);

				for (let link of links) {
					let linkFullPath = this.getFullPathForLink(link.link, notePath);
					if (linkFullPath == filePath) {
						if (!notes.contains(notePath))
							notes.push(notePath);
					}
				}
			}
		}

		return notes;
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

		let elements = text.match(markdownLinkRegex);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

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
}