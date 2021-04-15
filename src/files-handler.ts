import { App, TAbstractFile, TFile } from 'obsidian';
import { LinksHandler, PathChangeInfo } from './links-handler';
import { Utils } from './utils';
import { path } from './path';

export interface MovedAttachmentResult {
	movedAttachments: PathChangeInfo[]
	renamedFiles: PathChangeInfo[],
}

export class FilesHandler {
	constructor(
		private app: App,
		private lh: LinksHandler,
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

	async createFolderForAttachmentFromLink(link: string, owningNotePath: string) {
		let newFullPath = this.lh.getFullPathForLink(link, owningNotePath);
		return await this.createFolderForAttachmentFromPath(newFullPath);
	}

	async createFolderForAttachmentFromPath(filePath: string) {
		let newParentFolder = filePath.substring(0, filePath.lastIndexOf("/"));
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



	async moveCachedNoteAttachments(oldNotePath: string, newNotePath: string,
		deleteExistFiles: boolean): Promise<MovedAttachmentResult> {

		if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath))
			return;

		//try to get embeds for old or new path (metadataCache can be updated or not)		
		//!!! this can return undefined if note was just updated
		let embeds = this.app.metadataCache.getCache(newNotePath)?.embeds;
		if (!embeds)
			embeds = this.app.metadataCache.getCache(oldNotePath)?.embeds;

		if (!embeds)
			return;

		let result: MovedAttachmentResult = {
			movedAttachments: [],
			renamedFiles: []
		};

		for (let embed of embeds) {
			let link = embed.link;
			let oldLinkPath = this.lh.getFullPathForLink(link, oldNotePath);

			if (result.movedAttachments.findIndex(x => x.oldPath == oldLinkPath) != -1)
				continue;//already moved

			let file = this.lh.getFileByLink(link, oldNotePath);
			if (!file) {
				file = this.lh.getFileByLink(link, newNotePath);
				if (!file) {
					console.error(this.consoleLogPrefix + oldNotePath + " has bad embed (file does not exist): " + link);
					continue;
				}
			}

			//if attachment not in the note folder, skip it
			// = "." means that note was at root path, so do not skip it
			if (path.dirname(oldNotePath) != "." && !path.dirname(oldLinkPath).startsWith(path.dirname(oldNotePath)))
				continue;

			let newLinkPath = this.lh.getFullPathForLink(link, newNotePath);
			if (newLinkPath == file.path)
				continue; //nothing to change


			let res = await this.moveAttachment(file, newLinkPath, [oldNotePath, newNotePath], deleteExistFiles);
			result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
			result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);

		}

		return result;
	}


	async collectAttachmentsForCachedNote(notePath: string, subfolderName: string,
		deleteExistFiles: boolean): Promise<MovedAttachmentResult> {

		if (this.isPathIgnored(notePath))
			return;

		let result: MovedAttachmentResult = {
			movedAttachments: [],
			renamedFiles: []
		};

		//!!! this can return undefined if note was just updated
		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
		if (embeds) {
			for (let embed of embeds) {
				let link = embed.link;

				let fillPathLink = this.lh.getFullPathForLink(link, notePath);
				if (result.movedAttachments.findIndex(x => x.oldPath == fillPathLink) != -1)
					continue;//already moved	

				let file = this.lh.getFileByLink(link, notePath)
				if (!file) {
					console.error(this.consoleLogPrefix + notePath + " has bad embed (file does not exist): " + link);
					continue;
				}

				let newPath = (subfolderName == "") ? path.dirname(notePath) : path.join(path.dirname(notePath), subfolderName);
				newPath = Utils.normalizePathForFile(path.join(newPath, path.basename(file.path)));


				if (newPath == file.path)//nothing to move
					continue;

				let res = await this.moveAttachment(file, newPath, [notePath], deleteExistFiles);

				result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
				result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);
			}
		}

		//!!! this can return undefined if note was just updated
		let links = this.app.metadataCache.getCache(notePath)?.links;
		if (links) {
			for (let l of links) {
				let link = this.lh.splitLinkToPathAndSection(l.link).link;

				if (link.startsWith("#")) //internal section link
					continue;

				if (link.endsWith(".md"))
					continue;

				let fillPathLink = this.lh.getFullPathForLink(link, notePath);
				if (result.movedAttachments.findIndex(x => x.oldPath == fillPathLink) != -1)
					continue;//already moved	

				let file = this.lh.getFileByLink(link, notePath)
				if (!file) {
					console.error(this.consoleLogPrefix + notePath + " has bad link (file does not exist): " + link);
					continue;
				}

				let newPath = (subfolderName == "") ? path.dirname(notePath) : path.join(path.dirname(notePath), subfolderName);
				newPath = Utils.normalizePathForFile(path.join(newPath, path.basename(file.path)));

				if (newPath == file.path)//nothing to move
					continue;

				let res = await this.moveAttachment(file, newPath, [notePath], deleteExistFiles);

				result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
				result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);
			}
		}

		return result;
	}


	async moveAttachment(file: TFile, newLinkPath: string, parentNotePaths: string[], deleteExistFiles: boolean): Promise<MovedAttachmentResult> {
		if (this.isPathIgnored(file.path))
			return;


		if (file.path == newLinkPath) {
			console.warn(this.consoleLogPrefix + "Cant move file. Source and destination path the same.")
			return;
		}

		let result: MovedAttachmentResult = {
			movedAttachments: [],
			renamedFiles: []
		};

		await this.createFolderForAttachmentFromPath(newLinkPath);

		let linkedNotes = this.lh.getCachedNotesThatHaveLinkToFile(file.path);
		if (parentNotePaths) {
			for (let notePath of parentNotePaths) {
				linkedNotes.remove(notePath);
			}
		}

		//if no other file has link to this file - try to move file
		//if file already exist at new location - delete or move with new name
		if (linkedNotes.length == 0) {
			let existFile = this.lh.getFileByPath(newLinkPath);
			if (!existFile) {
				//move
				console.log(this.consoleLogPrefix + "move file [from, to]: \n   " + file.path + "\n   " + newLinkPath)
				result.movedAttachments.push({ oldPath: file.path, newPath: newLinkPath })
				await this.app.vault.rename(file, newLinkPath);
			} else {
				if (deleteExistFiles) {
					//delete
					console.log(this.consoleLogPrefix + "delete file: \n   " + file.path)
					result.movedAttachments.push({ oldPath: file.path, newPath: newLinkPath })
					await this.app.vault.trash(file, true);
				} else {
					//move with new name
					let newFileCopyName = this.generateFileCopyName(newLinkPath)
					console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
					result.movedAttachments.push({ oldPath: file.path, newPath: newFileCopyName })
					await this.app.vault.rename(file, newFileCopyName);
					result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
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
				result.movedAttachments.push({ oldPath: file.path, newPath: newLinkPath })
				await this.app.vault.copy(file, newLinkPath);
			} else {
				if (deleteExistFiles) {
					//do nothing
				} else {
					//copy with new name
					let newFileCopyName = this.generateFileCopyName(newLinkPath)
					console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + file.path + "\n   " + newFileCopyName)
					result.movedAttachments.push({ oldPath: file.path, newPath: newFileCopyName })
					await this.app.vault.copy(file, newFileCopyName);
					result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName })
				}
			}
		}
		return result;
	}




	async deleteEmptyFolders(dirName: string) {
		if (this.isPathIgnored(dirName))
			return;

		if (dirName.startsWith("./"))
			dirName = dirName.substring(2);


		let list = await this.app.vault.adapter.list(dirName);
		for (let folder of list.folders) {
			await this.deleteEmptyFolders(folder)
		}

		list = await this.app.vault.adapter.list(dirName);
		if (list.files.length == 0 && list.folders.length == 0) {
			console.log(this.consoleLogPrefix + "delete empty folder: \n   " + dirName)
			if (await this.app.vault.adapter.exists(dirName))
				await this.app.vault.adapter.rmdir(dirName, false);
		}
	}

	async deleteUnusedAttachmentsForCachedNote(notePath: string) {
		if (this.isPathIgnored(notePath))
			return;

		//!!! this can return undefined if note was just updated
		let embeds = this.app.metadataCache.getCache(notePath)?.embeds;
		if (embeds) {
			for (let embed of embeds) {
				let link = embed.link;

				let fullPath = this.lh.getFullPathForLink(link, notePath);
				let linkedNotes = this.lh.getCachedNotesThatHaveLinkToFile(fullPath);
				if (linkedNotes.length == 0) {
					let file = this.lh.getFileByLink(link, notePath);
					if (file) {
						try {
							await this.app.vault.trash(file, true);
						} catch { }
					}
				}
			}
		}

	}
}


