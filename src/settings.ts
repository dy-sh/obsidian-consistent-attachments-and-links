import { App, PluginSettingTab, Setting, } from 'obsidian';
import MoveNoteWithAttachments from './main';

export interface PluginSettings {
	deleteExistFilesWhenMoveNote: boolean;
	changeNoteBacklinksAlt: boolean;
	deleteFilesWithNote: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	deleteExistFilesWhenMoveNote: false,
	changeNoteBacklinksAlt: false,
	deleteFilesWithNote: true
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
            .setName('Delete exist attachments when move note')
            .setDesc('Delete attachment when moving a note if there is a file with the same name in the new folder. If disabled, file will be renamed and moved.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteExistFilesWhenMoveNote = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteExistFilesWhenMoveNote));

        new Setting(containerEl)
            .setName('Change backlinks text for reanamed note')
            .setDesc('When the note is renamed, the links to it are updated. If this option is enabled, the text of links to this note will also be automatically changed.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.changeNoteBacklinksAlt = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.changeNoteBacklinksAlt));

        new Setting(containerEl)
            .setName('Delete unused attachments with note')
            .setDesc('When note is deleted, delete and all attachments that are no longer used.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteFilesWithNote = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteFilesWithNote));
    }
}