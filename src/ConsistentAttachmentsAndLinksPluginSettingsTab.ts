import {
  normalizePath,
  Setting
} from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { extend } from 'obsidian-dev-utils/obsidian/Plugin/ValueComponent';

import type ConsistentAttachmentsAndLinksPlugin from './ConsistentAttachmentsAndLinksPlugin.ts';

export class ConsistentAttachmentsAndLinksPluginSettingsTab extends PluginSettingsTabBase<ConsistentAttachmentsAndLinksPlugin> {
  private getNormalizedPath(path: string): string {
    return path.length == 0 ? path : normalizePath(path);
  }

  public override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName('Move Attachments with Note')
      .setDesc('Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'moveAttachmentsWithNote'));

    new Setting(this.containerEl)
      .setName('Delete Unused Attachments with Note')
      .setDesc('Automatically remove attachments that are no longer referenced in other notes when the note is deleted.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'deleteAttachmentsWithNote'));

    new Setting(this.containerEl)
      .setName('Update Links')
      .setDesc('Automatically update links to attachments and other notes when moving notes or attachments.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'updateLinks'));

    new Setting(this.containerEl)
      .setName('Delete Empty Folders')
      .setDesc('Automatically remove empty folders after moving notes with attachments.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'deleteEmptyFolders'));

    new Setting(this.containerEl)
      .setName('Delete Duplicate Attachments on Note Move')
      .setDesc('Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'deleteExistFilesWhenMoveNote'));

    new Setting(this.containerEl)
      .setName('Update Backlink Text on Note Rename')
      .setDesc('When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'changeNoteBacklinksAlt'));

    new Setting(this.containerEl)
      .setName('Ignore Folders')
      .setDesc('Specify a list of folders to ignore. Enter each folder on a new line.')
      .addTextArea((textArea) => extend(textArea).bind(this.plugin, 'ignoreFolders', {
        componentToPluginSettingsValueConverter: (value) => value.trim().split('\n').map((value) => this.getNormalizedPath(value) + '/'),
        pluginSettingsToComponentValueConverter: (value) => value.join('\n')
      })
        .setPlaceholder('Example: .git, .obsidian')
      );

    new Setting(this.containerEl)
      .setName('Ignore Files')
      .setDesc('Specify a list of files to ignore. Enter each file on a new line.')
      .addTextArea((textArea) => extend(textArea).bind(this.plugin, 'ignoreFiles', {
        componentToPluginSettingsValueConverter: (value) => value.trim().split('\n'),
        pluginSettingsToComponentValueConverter: (value) => value.join('\n')
      })
        .setPlaceholder('Example: consistent-report.md')
      );

    new Setting(this.containerEl)
      .setName('Consistency Report Filename')
      .setDesc('Specify the name of the file for the consistency report.')
      .addText((text) => extend(text).bind(this.plugin, 'consistencyReportFile')
        .setPlaceholder('Example: consistency-report.md')
      );

    new Setting(this.containerEl)
      .setName('Auto Collect Attachments')
      .setDesc('Automatically collect attachments when the note is edited.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'autoCollectAttachments'));
  }
}
