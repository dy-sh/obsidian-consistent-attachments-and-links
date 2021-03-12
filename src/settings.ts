import { App, PluginSettingTab, Setting, } from 'obsidian';
import MoveNoteWithAttachments from './main';

export interface PluginSettings {
	deleteFilesWhenExist: boolean;
	changeNoteBacklinksAlt: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	deleteFilesWhenExist: false,
	changeNoteBacklinksAlt: false
}

export class SettingTab extends PluginSettingTab {
    plugin: MoveNoteWithAttachments;

    constructor(app: App, plugin: MoveNoteWithAttachments) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Move Note With Attachments - Settings' });

        new Setting(containerEl)
            .setName('Delete attachment if exist')
            .setDesc('Delete attachment when moving a note if there is a file with the same name in the new folder. If disabled, file will be renamed and moved.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteFilesWhenExist = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteFilesWhenExist));

        new Setting(containerEl)
            .setName('Change backlinks text for reanamed note')
            .setDesc('When the page is renamed, the links to it are updated. If this option is enabled, the text of links to this page will also be automatically changed.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.changeNoteBacklinksAlt = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.changeNoteBacklinksAlt));
    }
}