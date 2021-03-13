import { App, Plugin, TAbstractFile, TFile, EmbedCache, LinkCache } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { Utils } from './utils';

const path = require('path');



interface LinkChangeInfo {
	oldPath: string,
	newPath: string
}

export default class MoveNoteWithAttachments extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.handleDeletedFile(file)),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.handleRenamedFile(file, oldPath)),
		);
	}

	async handleDeletedFile(file: TAbstractFile) {
		let fileExt = file.path.substring(file.path.lastIndexOf("."));
		if (fileExt == ".md") {
			if (this.settings.deleteAttachmentsWithNote) {
				this.deleteUnusedAttachmentsForNote(file.path);
			}

			//delete child folders (do not delete parent)
			if (this.settings.deleteEmptyFolders) {
				let list = await this.app.vault.adapter.list(path.dirname(file.path));
				for (let folder of list.folders) {
					await this.deleteEmptyFolders(folder)
				}
			}
		}
	}

	async deleteUnusedAttachmentsForNote(notePath: string) {
		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
		if (embeds) {
			for (let embed of embeds) {
				let link = embed.link;

				let fullPath = this.getFullPathForLink(link, notePath);
				let linkedNotes = this.getNotesThatHaveLinkToFile(fullPath);
				if (linkedNotes.length == 0) {
					let file = this.getFileByLink(link, notePath);
					if (file) {
						await this.app.vault.trash(file, true);
					}
				}
			}
		}

	}

	async handleRenamedFile(file: TAbstractFile, oldPath: string) {
		let fileExt = oldPath.substring(oldPath.lastIndexOf("."));

		if (fileExt == ".md") {
			// await Utils.delay(500);//waiting for update metadataCache

			if (path.dirname(oldPath) != path.dirname(file.path)) {
				if (this.settings.moveAttachmentsWithNote) {
					await this.moveNoteAttachments(oldPath, file.path)
				}

				if (this.settings.updateLinks) {
					await this.updateInternalLinksInMovedNote(oldPath, file.path, this.settings.moveAttachmentsWithNote)
				}

				//delete child folders (do not delete parent)
				if (this.settings.deleteEmptyFolders) {
					let list = await this.app.vault.adapter.list(path.dirname(oldPath));
					for (let folder of list.folders) {
						await this.deleteEmptyFolders(folder)
					}
				}
			}
		}

		if (this.settings.updateLinks) {
			await this.updateLinksToRenamedFile(oldPath, file.path)
		}
	}

	async deleteEmptyFolders(dirName: string) {
		if (dirName.startsWith("./"))
			dirName = dirName.substring(2);

		for (let ignoreFolder of this.settings.ignoreFolders) {
			if (dirName.startsWith(ignoreFolder)) {
				return;
			}
		}

		let list = await this.app.vault.adapter.list(dirName);
		for (let folder of list.folders) {
			await this.deleteEmptyFolders(folder)
		}

		list = await this.app.vault.adapter.list(dirName);
		if (list.files.length == 0 && list.folders.length == 0) {
			console.log("Move Note With Attachments: delete empty folder: \n   " + dirName)
			await this.app.vault.adapter.rmdir(dirName, false);
		}
	}


	async moveNoteAttachments(oldNotePath: string, newNotePath: string) {

		//try to get embeds for olad or new path (metadataCache can be updated or not)		
		let embeds = this.app.metadataCache.getCache(newNotePath)?.embeds;
		if (!embeds)
			embeds = this.app.metadataCache.getCache(oldNotePath)?.embeds;

		if (embeds) {
			let renamedFiles: LinkChangeInfo[] = [];

			for (let embed of embeds) {
				let link = embed.link;

				let file = this.getFileByLink(link, oldNotePath);
				if (!file) {
					console.error("Move Note With Attachments: " + oldNotePath + " has bad link (file does not exist): " + link);
					continue;
				}

				let oldLinkPath = this.getFullPathForLink(link, oldNotePath);

				//if attachment not in note directory, skip it
				// = "." means that note was at root path, so do not skip it
				if (path.dirname(oldNotePath) != "." && !path.dirname(oldLinkPath).startsWith(path.dirname(oldNotePath)))
					continue;


				await this.createFolderForAttachment(link, newNotePath);
				let newLinkPath = this.getFullPathForLink(link, newNotePath);


				let linkedNotes = this.getNotesThatHaveLinkToFile(file.path);

				//if no other file has link to this file - try to move file
				//if file already exist at new location - delete or move with new name
				if (linkedNotes.length == 0) {
					let existFile = this.getFileByPath(newLinkPath);
					if (!existFile) {
						//move
						console.log("Move Note With Attachments: move file [from, to]: \n   " + file.path + "\n   " + newLinkPath)
						await this.app.vault.rename(file, newLinkPath);
					} else {
						if (this.settings.deleteExistFilesWhenMoveNote) {
							//delete
							console.log("Move Note With Attachments: delete file: \n   " + file.path)
							await this.app.vault.trash(file, true);
						} else {
							//move with new name
							let newFileCopyName = this.generateFileCopyName(newLinkPath)
							console.log("Move Note With Attachments: copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
							await this.app.vault.rename(file, newFileCopyName);
							renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
						}
					}
				}
				//if some other file has link to this file - try to copy file
				//if file already exist at new location - copy file with new name or do nothing
				else {
					let existFile = this.getFileByPath(newLinkPath);
					if (!existFile) {
						//copy
						console.log("Move Note With Attachments: copy file [from, to]: \n   " + file.path + "\n   " + newLinkPath)
						await this.app.vault.copy(file, newLinkPath);
					} else {
						if (this.settings.deleteExistFilesWhenMoveNote) {
							//do nothing
						} else {
							//copy with new name
							let newFileCopyName = this.generateFileCopyName(newLinkPath)
							console.log("Move Note With Attachments: copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
							await this.app.vault.copy(file, newFileCopyName);
							renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
						}
					}
				}
			}

			if (renamedFiles.length > 0) {
				if (this.settings.updateLinks) {
					await this.updateChangedLinksInNote(newNotePath, renamedFiles)
				}
			}
		}
	}

	generateFileCopyName(originalName: string): string {
		let ext = path.extname(originalName);
		let baseName = path.basename(originalName, ext);
		let dir = path.dirname(originalName);
		for (let i = 1; i < 100000; i++) {
			let newName = dir + "/" + baseName + " " + i + ext;
			let existFile = this.getFileByPath(newName);
			if (!existFile)
				return newName;
		}
		return "";
	}

	async updateLinksToRenamedFile(oldNotePath: string, newNotePath: string) {
		let notes = this.getNotesThatHaveLinkToFile(oldNotePath);
		let changedLinks: LinkChangeInfo[] = [{ oldPath: oldNotePath, newPath: newNotePath }];

		if (notes) {
			for (let note of notes) {
				await this.updateChangedLinksInNote(note, changedLinks);
			}
		}
	}

	async updateChangedLinksInNote(notePath: string, changedLinks: LinkChangeInfo[]) {
		let file = this.getFileByPath(notePath);
		if (!file) {
			console.error("Move Note With Attachments: " + "cant update links in note, file not found: " + notePath);
			return;
		}

		let text = await this.app.vault.read(file);
		let dirty = false;

		let elements = text.match(/\[.*?\)/g);
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

						if (this.settings.changeNoteBacklinksAlt && newRelLink.endsWith(".md")) {
							let ext = path.extname(newRelLink);
							let baseName = path.basename(newRelLink, ext);
							alt = Utils.normalizePathForFile(baseName);
						}

						text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')')

						dirty = true;

						console.log("Move Note With Attachments: link updated in note [note, old link, new link]: \n   "
							+ file.path + "\n   " + link + "   \n" + newRelLink)
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
			console.error("Move Note With Attachments: " + "cant update internal links, file not found: " + newNotePath);
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

				console.log("Move Note With Attachments: link updated in note [note, old link, new link]: \n   "
					+ file.path + "\n   " + link + "   \n" + newRelLink);
			}
		}

		if (dirty)
			await this.app.vault.modify(file, text);
	}



	getNotesThatHaveLinkToFile(filePath: string): string[] {
		let notes: string[] = [];
		let allNotes = this.app.vault.getMarkdownFiles();

		if (allNotes) {
			for (let note of allNotes) {
				let notePath = note.path;

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



	getAllEmbedsToFile(filePath: string): { [notePath: string]: EmbedCache[]; } {
		let allEmbeds: { [notePath: string]: EmbedCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
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

	getAllLinksToFile(filePath: string): { [notePath: string]: LinkCache[]; } {
		let allLinks: { [notePath: string]: LinkCache[]; } = {};
		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
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


	async createFolderForAttachment(link: string, owningNotePath: string) {
		let newFullPath = this.getFullPathForLink(link, owningNotePath);
		let newParentFolder = newFullPath.substring(0, newFullPath.lastIndexOf("/"));
		try {
			//todo check filder exist
			await this.app.vault.createFolder(newParentFolder)
		} catch { }
	}

	getFullPathForLink(link: string, owningNotePath: string) {
		link = Utils.normalizePathForFile(link);
		owningNotePath = Utils.normalizePathForFile(owningNotePath);

		let parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
		let fullPath = path.join(parentFolder, link);

		fullPath = Utils.normalizePathForFile(fullPath);
		return fullPath;
	}

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



	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


}




