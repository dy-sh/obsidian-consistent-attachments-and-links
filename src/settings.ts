import { App, PluginSettingTab, Setting, } from 'obsidian';
import MoveNoteWithAttachments from './main';

export interface PluginSettings {
	deleteFilesWhenExist: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	deleteFilesWhenExist: false
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


    }
}