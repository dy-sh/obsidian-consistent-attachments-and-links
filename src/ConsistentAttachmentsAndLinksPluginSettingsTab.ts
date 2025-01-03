import { Setting } from 'obsidian';
import { appendCodeBlock } from 'obsidian-dev-utils/DocumentFragment';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { extend } from 'obsidian-dev-utils/obsidian/Plugin/ValueComponent';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { ConsistentAttachmentsAndLinksPlugin } from './ConsistentAttachmentsAndLinksPlugin.ts';

export class ConsistentAttachmentsAndLinksPluginSettingsTab extends PluginSettingsTabBase<ConsistentAttachmentsAndLinksPlugin> {
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
      .setName('Consistency Report Filename')
      .setDesc('Specify the name of the file for the consistency report.')
      .addText((text) => extend(text).bind(this.plugin, 'consistencyReportFile')
        .setPlaceholder('Example: consistency-report.md')
      );

    const pathBindSettings = {
      componentToPluginSettingsValueConverter: (value: string): string[] => value.split('\n').filter(Boolean),
      pluginSettingsToComponentValueConverter: (value: string[]): string => value.join('\n'),
      valueValidator: (value: string): null | string => {
        const paths = value.split('\n');
        for (const path of paths) {
          if (path.startsWith('/') && path.endsWith('/')) {
            const regExp = path.slice(1, -1);
            if (!isValidRegExp(regExp)) {
              return `Invalid regular expression ${path}`;
            }
          }
        }
        return null;
      }
    };

    new Setting(this.containerEl)
      .setName('Auto Collect Attachments')
      .setDesc('Automatically collect attachments when the note is edited.')
      .addToggle((toggle) => extend(toggle).bind(this.plugin, 'autoCollectAttachments'));
    new Setting(this.containerEl)
      .setName('Include paths')
      .setDesc(createFragment((f) => {
        f.appendText('Include notes from the following paths');
        f.createEl('br');
        f.appendText('Insert each path on a new line');
        f.createEl('br');
        f.appendText('You can use path string or ');
        appendCodeBlock(f, '/regular expression/');
        f.createEl('br');
        f.appendText('If the setting is empty, all notes are included');
      }))
      .addTextArea((textArea) => extend(textArea).bind(this.plugin, 'includePaths', pathBindSettings));

    new Setting(this.containerEl)
      .setName('Exclude paths')
      .setDesc(createFragment((f) => {
        f.appendText('Exclude notes from the following paths');
        f.createEl('br');
        f.appendText('Insert each path on a new line');
        f.createEl('br');
        f.appendText('You can use path string or ');
        appendCodeBlock(f, '/regular expression/');
        f.createEl('br');
        f.appendText('If the setting is empty, no notes are excluded');
      }))
      .addTextArea((textArea) => extend(textArea).bind(this.plugin, 'excludePaths', pathBindSettings));
  }
}
