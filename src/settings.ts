import {
  App,
  normalizePath,
  PluginSettingTab,
  Setting,
} from 'obsidian';
import ConsistentAttachmentsAndLinks from './main.ts';

export interface PluginSettings {
  moveAttachmentsWithNote: boolean;
  deleteAttachmentsWithNote: boolean;
  updateLinks: boolean;
  deleteEmptyFolders: boolean;
  deleteExistFilesWhenMoveNote: boolean;
  changeNoteBacklinksAlt: boolean;
  ignoreFolders: string[];
  ignoreFiles: string[];
  ignoreFilesRegex: RegExp[];
  attachmentsSubfolder: string;
  consistencyReportFile: string;
  useBuiltInObsidianLinkCaching: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  moveAttachmentsWithNote: true,
  deleteAttachmentsWithNote: true,
  updateLinks: true,
  deleteEmptyFolders: true,
  deleteExistFilesWhenMoveNote: true,
  changeNoteBacklinksAlt: false,
  ignoreFolders: [".git/", ".obsidian/"],
  ignoreFiles: ["consistency\\-report\\.md"],
  ignoreFilesRegex: [/consistency\-report\.md/],
  attachmentsSubfolder: "",
  consistencyReportFile: "consistency-report.md",
  useBuiltInObsidianLinkCaching: false,
}

export class SettingTab extends PluginSettingTab {
  public override plugin!: ConsistentAttachmentsAndLinks;

  constructor(app: App, plugin: ConsistentAttachmentsAndLinks) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl('h2', { text: 'Consistent attachments and links - Settings' });


    new Setting(containerEl)
      .setName('Move Attachments with Note')
      .setDesc('Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.moveAttachmentsWithNote = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.moveAttachmentsWithNote));


    new Setting(containerEl)
      .setName('Delete Unused Attachments with Note')
      .setDesc('Automatically remove attachments that are no longer referenced in other notes when the note is deleted.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.deleteAttachmentsWithNote = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.deleteAttachmentsWithNote));


    new Setting(containerEl)
      .setName('Update Links')
      .setDesc('Automatically update links to attachments and other notes when moving notes or attachments.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.updateLinks = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.updateLinks));

    new Setting(containerEl)
      .setName('Delete Empty Folders')
      .setDesc('Automatically remove empty folders after moving notes with attachments.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.deleteEmptyFolders = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.deleteEmptyFolders));


    new Setting(containerEl)
      .setName('Delete Duplicate Attachments on Note Move')
      .setDesc('Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.deleteExistFilesWhenMoveNote = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.deleteExistFilesWhenMoveNote));


    new Setting(containerEl)
      .setName('Update Backlink Text on Note Rename')
      .setDesc('When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.')
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.changeNoteBacklinksAlt = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.changeNoteBacklinksAlt));



    new Setting(containerEl)
      .setName("Ignore Folders")
      .setDesc("Specify a list of folders to ignore. Enter each folder on a new line.")
      .addTextArea(cb => cb
        .setPlaceholder("Example: .git, .obsidian")
        .setValue(this.plugin.settings.ignoreFolders.join("\n"))
        .onChange((value) => {
          let paths = value.trim().split("\n").map(value => this.getNormalizedPath(value) + "/");
          this.plugin.settings.ignoreFolders = paths;
          this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Ignore Files")
      .setDesc("Specify a list of files to ignore. Enter each file on a new line.")
      .addTextArea(cb => cb
        .setPlaceholder("Example: consistent-report.md")
        .setValue(this.plugin.settings.ignoreFiles.join("\n"))
        .onChange((value) => {
          let paths = value.trim().split("\n");
          this.plugin.settings.ignoreFiles = paths;
          this.plugin.settings.ignoreFilesRegex = paths.map(file => RegExp(file));
          this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Attachment Subfolder")
      .setDesc("Specify the subfolder within the note folder to collect attachments into when using the \"Collect All Attachments\" hotkey. Leave empty to collect attachments directly into the note folder. You can use ${filename} as a placeholder for the current note name.")
      .addText(cb => cb
        .setPlaceholder("Example: _attachments")
        .setValue(this.plugin.settings.attachmentsSubfolder)
        .onChange((value) => {
          this.plugin.settings.attachmentsSubfolder = value;
          this.plugin.saveSettings();
        }));


    new Setting(containerEl)
      .setName("Consistency Report Filename")
      .setDesc("Specify the name of the file for the consistency report.")
      .addText(cb => cb
        .setPlaceholder("Example: consistency-report.md")
        .setValue(this.plugin.settings.consistencyReportFile)
        .onChange((value) => {
          this.plugin.settings.consistencyReportFile = value;
          this.plugin.saveSettings();
        }));


    new Setting(containerEl)
      .setName("EXPERIMENTAL: Use Built-in Obsidian Link Caching for Moved Notes")
      .setDesc("Enable this option to use the experimental built-in Obsidian link caching for processing moved notes. Turn it off if the plugin misbehaves.")
      .addToggle(cb => cb.onChange(value => {
        this.plugin.settings.useBuiltInObsidianLinkCaching = value;
        this.plugin.saveSettings();
      }
      ).setValue(this.plugin.settings.useBuiltInObsidianLinkCaching));
  }

  getNormalizedPath(path: string): string {
    return path.length == 0 ? path : normalizePath(path);
  }
}
