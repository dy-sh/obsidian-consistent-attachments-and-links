import { App, normalizePath, PluginSettingTab, Setting, } from 'obsidian';
import ConsistentAttachmentsAndLinks from './main';

export interface PluginSettings {
    moveAttachmentsWithNote: boolean;
    deleteAttachmentsWithNote: boolean;
    updateLinks: boolean;
    deleteEmptyFolders: boolean;
    deleteExistFilesWhenMoveNote: boolean;
    changeNoteBacklinksAlt: boolean;
    ignoreFolders: string[];
    attachmentsSubfolder: string;
    consistantReportFile: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    moveAttachmentsWithNote: true,
    deleteAttachmentsWithNote: true,
    updateLinks: true,
    deleteEmptyFolders: true,
    deleteExistFilesWhenMoveNote: true,
    changeNoteBacklinksAlt: false,
    ignoreFolders: [".git/", ".obsidian/"],
    attachmentsSubfolder: "",
    consistantReportFile: "consistant-report.md",
}

export class SettingTab extends PluginSettingTab {
    plugin: ConsistentAttachmentsAndLinks;

    constructor(app: App, plugin: ConsistentAttachmentsAndLinks) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Consistent attachments and links - Settings' });


        new Setting(containerEl)
            .setName('Move attachments with note')
            .setDesc('When a note moves, move with it any attachments that are in the same folder and subfolders.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.moveAttachmentsWithNote = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.moveAttachmentsWithNote));


        new Setting(containerEl)
            .setName('Delete unused attachments with note')
            .setDesc('When the note is deleted, delete all attachments that are no longer used in other notes.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteAttachmentsWithNote = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteAttachmentsWithNote));


        new Setting(containerEl)
            .setName('Update links')
            .setDesc('Update links to attachments and other notes when moving notes or attachments.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.updateLinks = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.updateLinks));

        new Setting(containerEl)
            .setName('Delete empty folders')
            .setDesc('Delete empty folders after moving notes with attachments.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteEmptyFolders = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteEmptyFolders));


        new Setting(containerEl)
            .setName('Delete duplicate attachments while note moving')
            .setDesc('Delete attachment when moving a note if there is a file with the same name in the new folder. If disabled, file will be renamed and moved.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.deleteExistFilesWhenMoveNote = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.deleteExistFilesWhenMoveNote));


        new Setting(containerEl)
            .setName('Change backlink text when renaming a note')
            .setDesc('When the note is renamed, the links to it are updated. If this option is enabled, the text of links to this note will also be changed.')
            .addToggle(cb => cb.onChange(value => {
                this.plugin.settings.changeNoteBacklinksAlt = value;
                this.plugin.saveSettings();
            }
            ).setValue(this.plugin.settings.changeNoteBacklinksAlt));



        new Setting(containerEl)
            .setName("Ignore folders to delete")
            .setDesc("List of folders to ignore when deleting empty folders. Each folder on a new line.")
            .addTextArea(cb => cb
                .setPlaceholder("Example: .git, .obsidian")
                .setValue(this.plugin.settings.ignoreFolders.join("\n"))
                .onChange((value) => {
                    let paths = value.trim().split("\n").map(value => this.getNormalizedPath(value) + "/");
                    this.plugin.settings.ignoreFolders = paths;
                    this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Attachments subfolder")
            .setDesc("Collect attachments in this subfolder of the note folder (when using the \"Collect all attachments\" hotkey). Leave empty to collect attachments to the note folder without subfolders.")
            .addText(cb => cb
                .setPlaceholder("Example: _attachments")
                .setValue(this.plugin.settings.attachmentsSubfolder)
                .onChange((value) => {
                    this.plugin.settings.attachmentsSubfolder = value;
                    this.plugin.saveSettings();
                }));


        new Setting(containerEl)
            .setName("Consistant report file name")
            .setDesc("")
            .addText(cb => cb
                .setPlaceholder("Example: consistant-report.md")
                .setValue(this.plugin.settings.consistantReportFile)
                .onChange((value) => {
                    this.plugin.settings.consistantReportFile = value;
                    this.plugin.saveSettings();
                }));
    }

    getNormalizedPath(path: string): string {
        return path.length == 0 ? path : normalizePath(path);
    }
}