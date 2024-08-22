import {
  normalizePath,
  Setting
} from "obsidian";
import type ConsistentAttachmentsAndLinksPlugin from "./ConsistentAttachmentsAndLinksPlugin.ts";
import type ConsistentAttachmentsAndLinksPluginSettings from "./ConsistentAttachmentsAndLinksPluginSettings.ts";
import { PluginSettingsTabBase } from "obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase";

export class ConsistentAttachmentsAndLinksPluginSettingsTab extends PluginSettingsTabBase<ConsistentAttachmentsAndLinksPlugin, ConsistentAttachmentsAndLinksPluginSettings> {
  public override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("Move Attachments with Note")
      .setDesc("Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "moveAttachmentsWithNote"));

    new Setting(this.containerEl)
      .setName("Delete Unused Attachments with Note")
      .setDesc("Automatically remove attachments that are no longer referenced in other notes when the note is deleted.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "deleteAttachmentsWithNote"));

    new Setting(this.containerEl)
      .setName("Update Links")
      .setDesc("Automatically update links to attachments and other notes when moving notes or attachments.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "updateLinks"));

    new Setting(this.containerEl)
      .setName("Delete Empty Folders")
      .setDesc("Automatically remove empty folders after moving notes with attachments.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "deleteEmptyFolders"));

    new Setting(this.containerEl)
      .setName("Delete Duplicate Attachments on Note Move")
      .setDesc("Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "deleteExistFilesWhenMoveNote"));

    new Setting(this.containerEl)
      .setName("Update Backlink Text on Note Rename")
      .setDesc("When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "changeNoteBacklinksAlt"));

    new Setting(this.containerEl)
      .setName("Ignore Folders")
      .setDesc("Specify a list of folders to ignore. Enter each folder on a new line.")
      .addTextArea((textArea) => this.bindValueComponent(textArea, "ignoreFolders", {
        settingToUIValueConverter: (value) => value.join("\n"),
        uiToSettingValueConverter: (value) => value.trim().split("\n").map((value) => this.getNormalizedPath(value) + "/")
      })
        .setPlaceholder("Example: .git, .obsidian")
      );


    new Setting(this.containerEl)
      .setName("Ignore Files")
      .setDesc("Specify a list of files to ignore. Enter each file on a new line.")
      .addTextArea((textArea) => this.bindValueComponent(textArea, "ignoreFiles", {
        settingToUIValueConverter: (value) => value.join("\n"),
        uiToSettingValueConverter: (value) => value.trim().split("\n")
      })
        .setPlaceholder("Example: consistent-report.md")
      );

    new Setting(this.containerEl)
      .setName("Consistency Report Filename")
      .setDesc("Specify the name of the file for the consistency report.")
      .addText((text) => this.bindValueComponent(text, "consistencyReportFile")
        .setPlaceholder("Example: consistency-report.md")
      );

    new Setting(this.containerEl)
      .setName("Auto Collect Attachments")
      .setDesc("Automatically collect attachments when the note is edited.")
      .addToggle((toggle) => this.bindValueComponent(toggle, "autoCollectAttachments"));
  }

  private getNormalizedPath(path: string): string {
    return path.length == 0 ? path : normalizePath(path);
  }
}
