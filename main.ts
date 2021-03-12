import { App, Plugin, PluginSettingTab, Setting, MarkdownView, TAbstractFile, getLinkpath, iterateCacheRefs, TFile, } from 'obsidian';
import * as CodeMirror from "codemirror";

interface PluginSettings {
	language: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	language: ''
}

interface Link {
	link: string;
	files: string[];
}


export default class MoveNoteWithAttachments extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// this.addCommand({
		// 	id: 'test',
		// 	name: 'Test',
		// 	callback: () => this.test()
		// });

		this.addSettingTab(new SettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.moveNoteAttachments(file, oldPath)),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.deleteNoteAttachments(file)),
		);
	}

	deleteNoteAttachments(file: TAbstractFile) {

	}


	async moveNoteAttachments(noteFile: TAbstractFile, noteOldPath: string) {
		// await this.delay(500);//waiting for move note

		let fileExt = noteOldPath.substring(noteOldPath.lastIndexOf("."));

		if (fileExt == ".md") {
			let embeds = this.app.metadataCache.getCache(noteFile.path)?.embeds; //metadataCache still has old path links
			if (!embeds)
				embeds = this.app.metadataCache.getCache(noteOldPath)?.embeds; //metadataCache has new path links

			for (let key in embeds) {
				let link = embeds[key].link;

				let file = this.getFileByLink(link, noteOldPath);
				if (!file) {
					console.error("Move Note With Attachments: " + noteOldPath + " has bad link (file does not exist): " + link);
					continue;
				}

				await this.createFolderForAttachment(link, noteFile.path);
				let newFullPath = this.getFullPathForLink(link, noteFile.path);

				let backlinks = this.getBacklinksForFile(file);
				//if no other file has link to this file
				if (backlinks.length == 0) {
					console.log("move " + newFullPath)
					//move file. if file already exist at new location - just delete the old one
					let existFile = this.getFileByPath(newFullPath);
					if (!existFile) {
						await this.app.vault.rename(file, newFullPath);
					} else {
						// await this.app.vault.rename(file, newFullPath+".png");
						await this.app.vault.trash(file, true);
					}
				}
				//if some other file has link to this file
				else {
					console.log("copy " + newFullPath)
					//copy file. if file already exist at new location - do nothing
					let existFile = this.getFileByPath(newFullPath);
					if (!existFile) {
						await this.app.vault.copy(file, newFullPath);
					}
				}

			}
		}
	}


	getBacklinksForFile(file: TFile): string[] {
		let backlinks: string[] = [];
		let notes = this.app.vault.getMarkdownFiles();

		for (let noteKey in notes) {
			let notePath = notes[noteKey].path;
			let embeds = this.app.metadataCache.getCache(notePath)?.embeds;

			//just moved note will have undefined embeds, so it will be skipped

			for (let embKey in embeds) {
				let link = embeds[embKey].link;
				let linkFullPath = this.getFullPathForLink(link, notePath);
				if (linkFullPath == file.path) {
					if (!backlinks.contains(notePath))
						backlinks.push(notePath);
				}
			}
		}

		return backlinks;
	}

	async createFolderForAttachment(link: string, owningNotePath: string) {
		let newFullPath = this.getFullPathForLink(link, owningNotePath);
		let newParentFolder = newFullPath.substring(0, newFullPath.lastIndexOf("/"));
		console.log(newParentFolder)
		try {
			//todo check filder exist
			await this.app.vault.createFolder(newParentFolder)
		} catch { }
	}

	getFullPathForLink(link: string, owningNotePath: string) {
		let parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
		let fullPath = parentFolder + "/" + link;
		return fullPath;
	}

	getFileByLink(link: string, owningNotePath: string): TFile {
		let fullPath = this.getFullPathForLink(link, owningNotePath);
		let file = this.getFileByPath(fullPath);
		return file;
	}

	getFileByPath(path: string): TFile {
		let files = this.app.vault.getFiles();
		let file = files.find(file => file.path === path);
		return file;
	}



	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async delay(ms: number) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}



class SettingTab extends PluginSettingTab {
	plugin: MoveNoteWithAttachments;

	constructor(app: App, plugin: MoveNoteWithAttachments) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Plugin - Settings' });

		new Setting(containerEl)
			.setName('Language')
			.setDesc('')
			.addText(text => text
				.setPlaceholder('Example: c++')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				}));
	}
}
