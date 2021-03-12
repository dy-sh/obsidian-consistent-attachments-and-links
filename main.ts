import { App, Plugin, PluginSettingTab, Setting, MarkdownView, TAbstractFile, getLinkpath, iterateCacheRefs, TFile, } from 'obsidian';
import * as CodeMirror from "codemirror";
const path = require('path');

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
			this.app.vault.on('rename', (file, oldPath) => this.proceedMovedFile(file, oldPath)),
		);

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.deleteNoteAttachments(file)),
		);
	}

	deleteNoteAttachments(file: TAbstractFile) {
		//todo
	}

	async proceedMovedFile(noteFile: TAbstractFile, oldNotePath: string) {

		let fileExt = oldNotePath.substring(oldNotePath.lastIndexOf("."));
		if (fileExt == ".md") {

			let newNotePath = noteFile.path;

			await this.delay(500);//waiting for move note
			await this.moveNoteAttachments(oldNotePath, newNotePath)
			await this.updateInternalLinksInNote(oldNotePath, newNotePath)
			//todo: delete empty folders
		}
	}

	async moveNoteAttachments(oldNotePath: string, newNotePath: string) {

		let embeds = this.app.metadataCache.getCache(newNotePath)?.embeds; //wait to metadataCache update before call it

		for (let key in embeds) {
			let link = embeds[key].link;

			let file = this.getFileByLink(link, oldNotePath);
			if (!file) {
				console.error("Move Note With Attachments: " + oldNotePath + " has bad link (file does not exist): " + link);
				continue;
			}

			await this.createFolderForAttachment(link, newNotePath);
			let newFullPath = this.getFullPathForLink(link, newNotePath);

			let backlinks = this.getBacklinksForFile(file);
			//if no other file has link to this file
			if (backlinks.length == 0) {
				console.log("move " + newFullPath)
				//move file. if file already exist at new location - just delete the old one
				let existFile = this.getFileByPath(newFullPath);
				if (!existFile) {
					await this.app.vault.rename(file, newFullPath);
				} else {
					//todo: optional, rename attachment to new name and move to new path
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
				} else {
					//todo: optional, rename attachment to new name and copy to new path
				}
			}
		}
	}



	async updateInternalLinksInNote(oldNotePath: string, newNotePath: string) {
		let file = this.getFileByPath(newNotePath);
		if (!file) {
			console.error("Move Note With Attachments: " + "cant update links, file not found: " + newNotePath);
			return;
		}

		let text = await this.app.vault.read(file);

		let elements = text.match(/\[.*?\)/g);
		if (elements != null && elements.length > 0) {
			for (let el of elements) {
				let alt = el.match(/\[(.*?)\]/)[1];
				let link = el.match(/\((.*?)\)/)[1];

				if (link.endsWith(".md")) {
					let fullLink = this.getFullPathForLink(link, oldNotePath);
					let newRelLink: string = path.relative(newNotePath, fullLink);
					newRelLink = this.normalizePath(newRelLink); //replace \ to /

					if (newRelLink.startsWith("../"))
						newRelLink = newRelLink.substring(3);

					text = text.replace(el, '[' + alt + ']' + '(' + newRelLink + ')')
				}
			}
		}

		await this.app.vault.modify(file, text);
	}



	normalizePath(path: string) {
		let re = /\\/gi;
		path = path.replace(re, "/"); //replace \ to /
		return path;
	}

	getBacklinksForFile(file: TFile): string[] {
		//note! just moved note will have undefined embeds, so it will be skipped

		let backlinks: string[] = [];
		let notes = this.app.vault.getMarkdownFiles();

		for (let noteKey in notes) {
			let notePath = notes[noteKey].path;

			let embeds = this.app.metadataCache.getCache(notePath)?.embeds;

			for (let key in embeds) {
				let link = embeds[key].link;
				let linkFullPath = this.getFullPathForLink(link, notePath);
				if (linkFullPath == file.path) {
					if (!backlinks.contains(notePath))
						backlinks.push(notePath);
				}
			}

			let links = this.app.metadataCache.getCache(notePath)?.links;

			for (let key in links) {
				let link = links[key].link;
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
		try {
			//todo check filder exist
			await this.app.vault.createFolder(newParentFolder)
		} catch { }
	}

	getFullPathForLink(link: string, owningNotePath: string) {
		link = this.normalizePath(link);
		owningNotePath = this.normalizePath(owningNotePath);

		let parentFolder = owningNotePath.substring(0, owningNotePath.lastIndexOf("/"));
		let fullPath = path.join(parentFolder, link);

		fullPath = this.normalizePath(fullPath);

		return fullPath;
	}

	getFileByLink(link: string, owningNotePath: string): TFile {
		let fullPath = this.getFullPathForLink(link, owningNotePath);
		console.log(fullPath)
		let file = this.getFileByPath(fullPath);
		return file;
	}

	getFileByPath(path: string): TFile {
		path = this.normalizePath(path);
		let files = this.app.vault.getFiles();
		let file = files.find(file => this.normalizePath(file.path) === path);
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
