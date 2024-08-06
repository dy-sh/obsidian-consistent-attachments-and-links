import {
  App,
  normalizePath,
  PluginSettingTab,
  Setting
} from "obsidian";
import type ConsistentAttachmentsAndLinksPlugin from "./ConsistentAttachmentsAndLinksPlugin.ts";

export class ConsistentAttachmentsAndLinksPluginSettingsTab extends PluginSettingTab {
  public override plugin!: ConsistentAttachmentsAndLinksPlugin;

  public constructor(app: App, plugin: ConsistentAttachmentsAndLinksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  public override display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Consistent attachments and links - Settings" });

    const settings = this.plugin.settings;

    new Setting(containerEl)
      .setName("Move Attachments with Note")
      .setDesc("Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.moveAttachmentsWithNote = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.moveAttachmentsWithNote));

    new Setting(containerEl)
      .setName("Delete Unused Attachments with Note")
      .setDesc("Automatically remove attachments that are no longer referenced in other notes when the note is deleted.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.deleteAttachmentsWithNote = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.deleteAttachmentsWithNote));

    new Setting(containerEl)
      .setName("Update Links")
      .setDesc("Automatically update links to attachments and other notes when moving notes or attachments.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.updateLinks = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.updateLinks));

    new Setting(containerEl)
      .setName("Delete Empty Folders")
      .setDesc("Automatically remove empty folders after moving notes with attachments.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.deleteEmptyFolders = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.deleteEmptyFolders));

    new Setting(containerEl)
      .setName("Delete Duplicate Attachments on Note Move")
      .setDesc("Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.deleteExistFilesWhenMoveNote = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.deleteExistFilesWhenMoveNote));

    new Setting(containerEl)
      .setName("Update Backlink Text on Note Rename")
      .setDesc("When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.")
      .addToggle(cb => cb.onChange(async (value) => {
        settings.changeNoteBacklinksAlt = value;
        await this.plugin.saveSettings(settings);
      }
      ).setValue(settings.changeNoteBacklinksAlt));

    new Setting(containerEl)
      .setName("Ignore Folders")
      .setDesc("Specify a list of folders to ignore. Enter each folder on a new line.")
      .addTextArea(cb => cb
        .setPlaceholder("Example: .git, .obsidian")
        .setValue(settings.ignoreFolders.join("\n"))
        .onChange(async (value) => {
          const paths = value.trim().split("\n").map(value => this.getNormalizedPath(value) + "/");
          settings.ignoreFolders = paths;
          await this.plugin.saveSettings(settings);
        }));

    new Setting(containerEl)
      .setName("Ignore Files")
      .setDesc("Specify a list of files to ignore. Enter each file on a new line.")
      .addTextArea(cb => cb
        .setPlaceholder("Example: consistent-report.md")
        .setValue(settings.ignoreFiles.join("\n"))
        .onChange(async (value) => {
          const paths = value.trim().split("\n");
          settings.ignoreFiles = paths;
          await this.plugin.saveSettings(settings);
        }));

    new Setting(containerEl)
      .setName("Consistency Report Filename")
      .setDesc("Specify the name of the file for the consistency report.")
      .addText(cb => cb
        .setPlaceholder("Example: consistency-report.md")
        .setValue(settings.consistencyReportFile)
        .onChange(async (value) => {
          settings.consistencyReportFile = value;
          await this.plugin.saveSettings(settings);
        }));

    new Setting(containerEl)
      .setName("Auto Collect Attachments")
      .setDesc("Automatically collect attachments when the note is edited.")
      .addToggle((toggle) => toggle
        .setValue(settings.autoCollectAttachments)
        .onChange(async (value) => {
          settings.autoCollectAttachments = value;
          await this.plugin.saveSettings(settings);
        }));
  }

  private getNormalizedPath(path: string): string {
    return path.length == 0 ? path : normalizePath(path);
  }
}
