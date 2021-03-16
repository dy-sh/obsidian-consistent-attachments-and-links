import { App, Plugin, TAbstractFile, TFile, EmbedCache, LinkCache, Notice } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { Utils } from './utils';
import { LinksHandler, LinkChangeInfo } from './links-handler';
import { FilesHandler, MovedAttachmentResult } from './files-handler';

const path = require('path');





export default class ConsistentAttachmentsAndLinks extends Plugin {
	settings: PluginSettings;
	lh: LinksHandler;
	fh: FilesHandler;


	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.handleDeletedFile(file)),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.handleRenamedFile(file, oldPath)),
		);

		this.addCommand({
			id: 'collect-all-attachments',
			name: 'Collect all attachments',
			callback: () => this.collectAllAttachments()
		});

		this.addCommand({
			id: 'delete-empty-folders',
			name: 'Delete empty folders',
			callback: () => this.deleteEmptyFolders()
		});

		this.lh = new LinksHandler(this.app, "Consistent attachments and links: ");
		this.fh = new FilesHandler(this.app, this.lh, "Consistent attachments and links: ");
	}


	async handleDeletedFile(file: TAbstractFile) {
		let fileExt = file.path.substring(file.path.lastIndexOf("."));
		if (fileExt == ".md") {
			if (this.settings.deleteAttachmentsWithNote) {
				await this.fh.deleteUnusedAttachmentsForCachedNote(file.path);
			}

			//delete child folders (do not delete parent)
			if (this.settings.deleteEmptyFolders) {
				let list = await this.app.vault.adapter.list(path.dirname(file.path));
				for (let folder of list.folders) {
					await this.fh.deleteEmptyFolders(folder, this.settings.ignoreFolders);
				}
			}
		}
	}



	async handleRenamedFile(file: TAbstractFile, oldPath: string) {
		let result: MovedAttachmentResult;

		let fileExt = oldPath.substring(oldPath.lastIndexOf("."));

		if (fileExt == ".md") {
			// await Utils.delay(500);//waiting for update metadataCache

			if (path.dirname(oldPath) != path.dirname(file.path)) {
				if (this.settings.moveAttachmentsWithNote) {
					result = await this.fh.moveCachedNoteAttachments(
						oldPath,
						file.path,
						this.settings.deleteExistFilesWhenMoveNote
					)

					if (this.settings.updateLinks) {
						if (result && result.renamedFiles && result.renamedFiles.length > 0) {
							await this.lh.updateChangedLinksInNote(file.path, result.renamedFiles)
						}
					}
				}

				if (this.settings.updateLinks) {
					await this.lh.updateInternalLinksInMovedNote(oldPath, file.path, this.settings.moveAttachmentsWithNote)
				}

				//delete child folders (do not delete parent)
				if (this.settings.deleteEmptyFolders) {
					let list = await this.app.vault.adapter.list(path.dirname(oldPath));
					for (let folder of list.folders) {
						await this.fh.deleteEmptyFolders(folder, this.settings.ignoreFolders);
					}
				}
			}
		}

		let updateAlts = this.settings.changeNoteBacklinksAlt && fileExt == ".md";

		if (this.settings.updateLinks) {
			await this.lh.updateLinksToRenamedFile(oldPath, file.path, updateAlts)
		}

		if (result && result.movedAttachments && result.movedAttachments.length > 0) {
			new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
		}
	}


	async collectAllAttachments() {
		let movedAttachmentsCount = 0;
		let processedNotesCount = 0;

		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				let result = await this.fh.collectAttachmentsForCachedNote(
					note.path,
					this.settings.attachmentsSubfolder,
					this.settings.deleteExistFilesWhenMoveNote);

				if (result && result.movedAttachments && result.movedAttachments.length > 0) {
					await this.lh.updateChangedLinksInNote(note.path, result.movedAttachments)
					movedAttachmentsCount += result.movedAttachments.length;
					processedNotesCount++;
				}
			}
		}

		if (movedAttachmentsCount == 0)
			new Notice("No files found that need to be moved");
		else
			new Notice("Moved " + movedAttachmentsCount + " attachment" + (movedAttachmentsCount > 1 ? "s" : "")
				+ " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
	}

	deleteEmptyFolders() {
		this.fh.deleteEmptyFolders("/", this.settings.ignoreFolders)
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


}




