import { App, Plugin, TAbstractFile, TFile, EmbedCache, LinkCache } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { Utils } from './utils';
import { LinksHandler } from './links-handler';
import { FilesHandler } from './files-handler';

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

		this.lh = new LinksHandler(this.app, "Consistent attachments and links: ");
		this.fh = new FilesHandler(this.app, this.lh, "Consistent attachments and links: ");
	}

	async handleDeletedFile(file: TAbstractFile) {
		let fileExt = file.path.substring(file.path.lastIndexOf("."));
		if (fileExt == ".md") {
			if (this.settings.deleteAttachmentsWithNote) {
				this.fh.deleteUnusedAttachmentsForNote(file.path);
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
		let fileExt = oldPath.substring(oldPath.lastIndexOf("."));

		if (fileExt == ".md") {
			// await Utils.delay(500);//waiting for update metadataCache

			if (path.dirname(oldPath) != path.dirname(file.path)) {
				if (this.settings.moveAttachmentsWithNote) {
					await this.fh.moveNoteAttachments(
						oldPath,
						file.path,
						this.settings.deleteExistFilesWhenMoveNote,
						this.settings.updateLinks
					)
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
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}


}




