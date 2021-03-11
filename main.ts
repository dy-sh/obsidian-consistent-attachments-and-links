import { App, Plugin, PluginSettingTab, Setting, MarkdownView, TAbstractFile } from 'obsidian';
import * as CodeMirror from "codemirror";

interface PluginSettings {
	language: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	language: ''
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

	private moveNoteAttachments(file: TAbstractFile, oldPath: string) {

		// console.log(this.app.metadataCache);
		console.log(file);

		let embeds = this.app.metadataCache.getCache(oldPath)?.embeds; //metadataCache still has oldPath links

		for (let key in embeds) {
			console.log(embeds[key].link)
			this.moveFile(embeds[key].link, file.parent.path)
		}
	}

	async moveFile(link: string, newParent: string) {
		const file = this.app.metadataCache.getFirstLinkpathDest(link, "/");
		if (!file) {
			// console.error("file not found: " + oldPath)
			return;
		}
		console.log(file)

		let newParentPath = newParent + "/" + file.parent.name;
		try {
			//todo check filder exist
			await this.app.vault.createFolder(newParentPath)
		} catch { }


		let newPath = newParent + "/" + link;
		await this.app.vault.rename(file, newPath);
	}

	private deleteNoteAttachments(file: TAbstractFile) {

	}




	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
