import { App, PluginSettingTab, Setting, } from 'obsidian';
import MoveNoteWithAttachments from './main';

export interface PluginSettings {
	moveAttachmentsWithNote: boolean;
	deleteAttachmentsWithNote: boolean;
	updateLinks: boolean;
	deleteExistFilesWhenMoveNote: boolean;
	changeNoteBacklinksAlt: boolean;
	deleteEmptyFolders: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	moveAttachmentsWithNote: true,
	deleteAttachmentsWithNote: true,
	updateLinks: true,
	deleteExistFilesWhenMoveNote: false,
	changeNoteBacklinksAlt: false,
    deleteEmptyFolders: false,
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
        .setName('Move attachments with note')
        .setDesc('When the note is moved, move all attachments along with it, keeping relative paths.')
        .addToggle(cb => cb.onChange(value => {
            this.plugin.settings.moveAttachmentsWithNote = value;
            this.plugin.saveSettings();
        }
        ).setValue(this.plugin.settings.moveAttachmentsWithNote));


        new Setting(containerEl)
        .setName('Delete unused attachments with note')
        .setDesc('When note is deleted, delete and all attachments that are no longer used.')
        .addToggle(cb => cb.onChange(value => {
            this.plugin.settings.deleteAttachmentsWithNote = value;
            this.plugin.saveSettings();
        }
        ).setValue(this.plugin.settings.deleteAttachmentsWithNote));


        new Setting(containerEl)
        .setName('Update links')
        .setDesc('Update links when moving notes or attachments')
        .addToggle(cb => cb.onChange(value => {
            this.plugin.settings.updateLinks = value;
            this.plugin.saveSettings();
        }
        ).setValue(this.plugin.settings.updateLinks));


        new Setting(containerEl)
            .setName('Remove duplicate attachments while note moving')
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
            .setName('Delete empty folders')
            .setDesc('Delete empty folders after moving notes with attachments.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteEmptyFolders = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteEmptyFolders));
    }
}