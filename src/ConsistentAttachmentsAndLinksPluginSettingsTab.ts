import { setIcon } from 'obsidian';
import { appendCodeBlock } from 'obsidian-dev-utils/HTMLElement';
import { alert } from 'obsidian-dev-utils/obsidian/Modals/Alert';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { ConsistentAttachmentsAndLinksPlugin } from './ConsistentAttachmentsAndLinksPlugin.ts';
import type { ConsistentAttachmentsAndLinksPluginSettings } from './ConsistentAttachmentsAndLinksPluginSettings.ts';

export class ConsistentAttachmentsAndLinksPluginSettingsTab extends PluginSettingsTabBase<ConsistentAttachmentsAndLinksPlugin> {
  public override display(): void {
    this.containerEl.empty();

    const moveAttachmentsWithNoteSettingName = 'Move Attachments with Note';
    new SettingEx(this.containerEl)
      .setName(moveAttachmentsWithNoteSettingName)
      .setDesc('Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.')
      .addToggle((toggle) =>
        this.bind(toggle, 'moveAttachmentsWithNote', {
          onChanged: async () => {
            await this.checkDangerousSetting('moveAttachmentsWithNote', moveAttachmentsWithNoteSettingName);
          }
        })
      );

    const deleteAttachmentsWithNoteSettingName = 'Delete Unused Attachments with Note';
    new SettingEx(this.containerEl)
      .setName(deleteAttachmentsWithNoteSettingName)
      .setDesc('Automatically remove attachments that are no longer referenced in other notes when the note is deleted.')
      .addToggle((toggle) =>
        this.bind(toggle, 'deleteAttachmentsWithNote', {
          onChanged: async () => {
            await this.checkDangerousSetting('deleteAttachmentsWithNote', deleteAttachmentsWithNoteSettingName);
          }
        })
      );

    new SettingEx(this.containerEl)
      .setName('Update Links')
      .setDesc('Automatically update links to attachments and other notes when moving notes or attachments.')
      .addToggle((toggle) => this.bind(toggle, 'updateLinks'));

    new SettingEx(this.containerEl)
      .setName('Delete Empty Folders')
      .setDesc('Automatically remove empty folders after moving notes with attachments.')
      .addToggle((toggle) => this.bind(toggle, 'deleteEmptyFolders'));

    const deleteExistFilesWhenMoveNoteSettingName = 'Delete Duplicate Attachments on Note Move';
    new SettingEx(this.containerEl)
      .setName(deleteExistFilesWhenMoveNoteSettingName)
      .setDesc(
        'Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.'
      )
      .addToggle((toggle) =>
        this.bind(toggle, 'deleteExistFilesWhenMoveNote', {
          onChanged: async () => {
            await this.checkDangerousSetting('deleteExistFilesWhenMoveNote', deleteExistFilesWhenMoveNoteSettingName);
          }
        })
      );

    new SettingEx(this.containerEl)
      .setName('Update Backlink Text on Note Rename')
      .setDesc(
        'When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.'
      )
      .addToggle((toggle) => this.bind(toggle, 'changeNoteBacklinksAlt'));

    new SettingEx(this.containerEl)
      .setName('Consistency Report Filename')
      .setDesc('Specify the name of the file for the consistency report.')
      .addText((text) =>
        this.bind(text, 'consistencyReportFile')
          .setPlaceholder('Example: consistency-report.md')
      );

    const autoCollectAttachmentsSettingName = 'Auto Collect Attachments';
    new SettingEx(this.containerEl)
      .setName(autoCollectAttachmentsSettingName)
      .setDesc('Automatically collect attachments when the note is edited.')
      .addToggle((toggle) =>
        this.bind(toggle, 'autoCollectAttachments', {
          onChanged: async () => {
            await this.checkDangerousSetting('autoCollectAttachments', autoCollectAttachmentsSettingName);
          }
        })
      );

    new SettingEx(this.containerEl)
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
      .addMultipleText((multipleText) => {
        this.bind(multipleText, 'includePaths', {
          valueValidator: pathsValidator
        });
      });

    new SettingEx(this.containerEl)
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
      .addMultipleText((multipleText) => {
        this.bind(multipleText, 'excludePaths', {
          valueValidator: pathsValidator
        });
      });
  }

  private async checkDangerousSetting(settingKey: keyof ConsistentAttachmentsAndLinksPluginSettings, settingName: string): Promise<void> {
    if (!this.plugin.settings[settingKey]) {
      return;
    }

    await alert({
      app: this.app,
      message: createFragment((f) => {
        f.createDiv({ cls: 'community-modal-readme' }, (wrapper) => {
          wrapper.appendText('You enabled ');
          wrapper.createEl('strong', { cls: 'markdown-rendered-code', text: settingName });
          wrapper.appendText(' setting. Without proper configuration it might lead to inconvenient attachment rearrangements or even data loss in your vault.');
          wrapper.createEl('br');
          wrapper.appendText('It is ');
          wrapper.createEl('strong', { text: 'STRONGLY' });
          wrapper.appendText(' recommended to backup your vault before using the plugin.');
          wrapper.createEl('br');
          wrapper.createEl('a', { href: 'https://github.com/dy-sh/obsidian-consistent-attachments-and-links?tab=readme-ov-file', text: 'Read more' });
          wrapper.appendText(' about how to use the plugin.');
        });
      }),
      title: createFragment((f) => {
        setIcon(f.createSpan(), 'triangle-alert');
        f.appendText(' Consistent Attachments and Links');
      })
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
function pathsValidator(paths: string[]): string | void {
  for (const path of paths) {
    if (path.startsWith('/') && path.endsWith('/')) {
      const regExp = path.slice(1, -1);
      if (!isValidRegExp(regExp)) {
        return `Invalid regular expression ${path}`;
      }
    }
  }
}
