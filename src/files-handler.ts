import { App, TAbstractFile, TFile } from 'obsidian';
import { LinksHandler, LinkChangeInfo } from './links-handler';

const path = require('path');

export class FilesHandler {
	constructor(
		private app: App,
		private lh: LinksHandler,
		private consoleLogPrefix: string = ""
	) { }



	async createFolderForAttachment(link: string, owningNotePath: string) {
		let newFullPath = this.lh.getFullPathForLink(link, owningNotePath);
		let newParentFolder = newFullPath.substring(0, newFullPath.lastIndexOf("/"));
		try {
			//todo check filder exist
			await this.app.vault.createFolder(newParentFolder)
		} catch { }
	}

	generateFileCopyName(originalName: string): string {
		let ext = path.extname(originalName);
		let baseName = path.basename(originalName, ext);
		let dir = path.dirname(originalName);
		for (let i = 1; i < 100000; i++) {
			let newName = dir + "/" + baseName + " " + i + ext;
			let existFile = this.lh.getFileByPath(newName);
			if (!existFile)
				return newName;
		}
		return "";
	}



	async moveNoteAttachments(oldNotePath: string, newNotePath: string,
		deleteExistFiles: boolean, updateLinks: boolean) {

		//try to get embeds for olad or new path (metadataCache can be updated or not)		
		let embeds = this.app.metadataCache.getCache(newNotePath)?.embeds;
		if (!embeds)
			embeds = this.app.metadataCache.getCache(oldNotePath)?.embeds;

		if (embeds) {
			let renamedFiles: LinkChangeInfo[] = [];

			for (let embed of embeds) {
				let link = embed.link;

				let file = this.lh.getFileByLink(link, oldNotePath);
				if (!file) {
					console.error(this.consoleLogPrefix + oldNotePath + " has bad link (file does not exist): " + link);
					continue;
				}

				let oldLinkPath = this.lh.getFullPathForLink(link, oldNotePath);

				//if attachment not in note directory, skip it
				// = "." means that note was at root path, so do not skip it
				if (path.dirname(oldNotePath) != "." && !path.dirname(oldLinkPath).startsWith(path.dirname(oldNotePath)))
					continue;


				await this.createFolderForAttachment(link, newNotePath);
				let newLinkPath = this.lh.getFullPathForLink(link, newNotePath);


				let linkedNotes = this.lh.getNotesThatHaveLinkToFile(file.path);

				//if no other file has link to this file - try to move file
				//if file already exist at new location - delete or move with new name
				if (linkedNotes.length == 0) {
					let existFile = this.lh.getFileByPath(newLinkPath);
					if (!existFile) {
						//move
						console.log(this.consoleLogPrefix + "move file [from, to]: \n   " + file.path + "\n   " + newLinkPath)
						await this.app.vault.rename(file, newLinkPath);
					} else {
						if (deleteExistFiles) {
							//delete
							console.log(this.consoleLogPrefix + "delete file: \n   " + file.path)
							await this.app.vault.trash(file, true);
						} else {
							//move with new name
							let newFileCopyName = this.generateFileCopyName(newLinkPath)
							console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
							await this.app.vault.rename(file, newFileCopyName);
							renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
						}
					}
				}
				//if some other file has link to this file - try to copy file
				//if file already exist at new location - copy file with new name or do nothing
				else {
					let existFile = this.lh.getFileByPath(newLinkPath);
					if (!existFile) {
						//copy
						console.log(this.consoleLogPrefix + "copy file [from, to]: \n   " + file.path + "\n   " + newLinkPath)
						await this.app.vault.copy(file, newLinkPath);
					} else {
						if (deleteExistFiles) {
							//do nothing
						} else {
							//copy with new name
							let newFileCopyName = this.generateFileCopyName(newLinkPath)
							console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
							await this.app.vault.copy(file, newFileCopyName);
							renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
						}
					}
				}
			}

			if (renamedFiles.length > 0) {
				if (updateLinks) {
					await this.lh.updateChangedLinksInNote(newNotePath, renamedFiles, false)
				}
			}
		}
	}

	async deleteEmptyFolders(dirName: string, ignoreFolders: string[]) {
		if (dirName.startsWith("./"))
			dirName = dirName.substring(2);

		for (let ignoreFolder of ignoreFolders) {
			if (dirName.startsWith(ignoreFolder)) {
				return;
			}
		}

		let list = await this.app.vault.adapter.list(dirName);
		for (let folder of list.folders) {
			await this.deleteEmptyFolders(folder, ignoreFolders)
		}

		list = await this.app.vault.adapter.list(dirName);
		if (list.files.length == 0 && list.folders.length == 0) {
			console.log(this.consoleLogPrefix + "delete empty folder: \n   " + dirName)
			await this.app.vault.adapter.rmdir(dirName, false);
		}
	}

	async deleteUnusedAttachmentsForNote(notePath: string) {
		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
		if (embeds) {
			for (let embed of embeds) {
				let link = embed.link;

				let fullPath = this.lh.getFullPathForLink(link, notePath);
				let linkedNotes = this.lh.getNotesThatHaveLinkToFile(fullPath);
				if (linkedNotes.length == 0) {
					let file = this.lh.getFileByLink(link, notePath);
					if (file) {
						await this.app.vault.trash(file, true);
					}
				}
			}
		}

	}
}


