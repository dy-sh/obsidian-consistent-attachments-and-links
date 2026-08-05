import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { setIcon } from 'obsidian';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import {
  CollectAttachmentUsedByMultipleNotesMode,
  MoveAttachmentToProperFolderUsedByMultipleNotesMode
} from './plugin-settings.ts';

type PluginSettingsTabConstructorParams = PluginSettingsTabBaseConstructorParams<PluginSettings>;

const MOVE_ATTACHMENTS_WITH_NOTE_SETTING_NAME = 'Move Attachments with Note';
const DELETE_ATTACHMENTS_WITH_NOTE_SETTING_NAME = 'Delete Unused Attachments with Note';
const DELETE_EXIST_FILES_WHEN_MOVE_NOTE_SETTING_NAME = 'Delete Duplicate Attachments on Note Move';
const AUTO_COLLECT_ATTACHMENTS_SETTING_NAME = 'Auto Collect Attachments';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'Automatically move attachments when a note is relocated. This includes attachments located in the same folder or any of its subfolders.',
        name: MOVE_ATTACHMENTS_WITH_NOTE_SETTING_NAME,
        render: (setting) => {
          setting.addToggle((toggle) =>
            this.bind({
              onChanged: async () => {
                await this.checkDangerousSetting('shouldMoveAttachmentsWithNote', MOVE_ATTACHMENTS_WITH_NOTE_SETTING_NAME);
              },
              propertyName: 'shouldMoveAttachmentsWithNote',
              valueComponent: toggle
            })
          );
        }
      }),
      this.settingEx({
        desc: 'Automatically remove attachments that are no longer referenced in other notes when the note is deleted.',
        name: DELETE_ATTACHMENTS_WITH_NOTE_SETTING_NAME,
        render: (setting) => {
          setting.addToggle((toggle) =>
            this.bind({
              onChanged: async () => {
                await this.checkDangerousSetting('shouldDeleteAttachmentsWithNote', DELETE_ATTACHMENTS_WITH_NOTE_SETTING_NAME);
              },
              propertyName: 'shouldDeleteAttachmentsWithNote',
              valueComponent: toggle
            })
          );
        }
      }),
      this.settingEx({
        desc: 'Automatically update links to attachments and other notes when moving notes or attachments.',
        name: 'Update links',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldUpdateLinks', valueComponent: toggle }));
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When the folder becomes empty, ');
          f.createEl('br');
          appendCodeBlock(f, 'Keep');
          f.appendText(' - will keep the empty folder, ');
          f.createEl('br');
          appendCodeBlock(f, 'Delete');
          f.appendText(' - will delete the empty folder, ');
          f.createEl('br');
          appendCodeBlock(f, 'Delete with empty parents');
          f.appendText(' - will delete the empty folder and its empty parent folders.');
        }),
        name: 'Empty folder behavior',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              /* eslint-disable perfectionist/sort-objects -- Need to keep enum order. */
              [EmptyFolderBehavior.Keep]: 'Keep',
              [EmptyFolderBehavior.Delete]: 'Delete',
              [EmptyFolderBehavior.DeleteWithEmptyParents]: 'Delete with empty parents'
              /* eslint-enable perfectionist/sort-objects -- Need to keep enum order. */
            });
            this.bind({ propertyName: 'emptyFolderBehavior', valueComponent: dropdown });
          });
        }
      }),
      this.settingEx({
        desc: 'Automatically delete attachments when moving a note if a file with the same name exists in the destination folder. If disabled, the file will be renamed and moved.',
        name: DELETE_EXIST_FILES_WHEN_MOVE_NOTE_SETTING_NAME,
        render: (setting) => {
          setting.addToggle((toggle) =>
            this.bind({
              onChanged: async () => {
                await this.checkDangerousSetting('shouldDeleteExistingFilesWhenMovingNote', DELETE_EXIST_FILES_WHEN_MOVE_NOTE_SETTING_NAME);
              },
              propertyName: 'shouldDeleteExistingFilesWhenMovingNote',
              valueComponent: toggle
            })
          );
        }
      }),
      this.settingEx({
        desc: 'When a note is renamed, its linked references are automatically updated. If this option is enabled, the text of backlinks to this note will also be modified.',
        name: 'Update backlink text on note rename',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldChangeNoteBacklinksDisplayText', valueComponent: toggle }));
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Add the plugin\'s commands (');
          appendCodeBlock(f, 'Collect attachments');
          f.appendText(', ');
          appendCodeBlock(f, 'Move attachment to proper folder');
          f.appendText(') to the file and folder context menu.');
          f.createEl('br');
          f.appendText('Disable this to avoid duplicate menu items when another plugin (e.g. ');
          appendCodeBlock(f, 'Custom Attachment Location');
          f.appendText(') provides the same commands. The commands remain available in the command palette.');
        }),
        name: 'Add commands to file menu',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldAddCommandsToFileMenu', valueComponent: toggle }));
        }
      }),
      this.settingEx({
        desc: 'Specify the name of the file for the consistency report.',
        name: 'Consistency report filename',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'consistencyReportFile', valueComponent: text });
          });
        }
      }),
      this.settingEx({
        desc: 'Automatically collect attachments when the note is edited.',
        name: AUTO_COLLECT_ATTACHMENTS_SETTING_NAME,
        render: (setting) => {
          setting.addToggle((toggle) =>
            this.bind({
              onChanged: async () => {
                await this.checkDangerousSetting('shouldCollectAttachmentsAutomatically', AUTO_COLLECT_ATTACHMENTS_SETTING_NAME);
              },
              propertyName: 'shouldCollectAttachmentsAutomatically',
              valueComponent: toggle
            })
          );
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Include notes from the following paths');
          f.createEl('br');
          f.appendText('Insert each path on a new line');
          f.createEl('br');
          f.appendText('You can use path string or ');
          appendCodeBlock(f, '/regular expression/');
          f.createEl('br');
          f.appendText('If the setting is empty, all notes are included');
        }),
        name: 'Include paths',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'includePaths', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Exclude notes from the following paths');
          f.createEl('br');
          f.appendText('Insert each path on a new line');
          f.createEl('br');
          f.appendText('You can use path string or ');
          appendCodeBlock(f, '/regular expression/');
          f.createEl('br');
          f.appendText('If the setting is empty, no notes are excluded');
        }),
        name: 'Exclude paths',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'excludePaths', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Exclude attachments from the following paths when ');
          appendCodeBlock(f, 'Collect attachments');
          f.appendText(' command is executed.');
          f.createEl('br');
          f.appendText('Insert each path on a new line');
          f.createEl('br');
          f.appendText('You can use path string or ');
          appendCodeBlock(f, '/regular expression/');
          f.createEl('br');
          f.appendText('If the setting is empty, no paths are excluded from attachment collecting.');
        }),
        name: 'Exclude paths from attachment collecting',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'excludePathsFromAttachmentCollecting', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Treat files with these extensions as attachments.');
          f.createEl('br');
          f.appendText('By default, ');
          appendCodeBlock(f, '.md');
          f.appendText(' and ');
          appendCodeBlock(f, '.canvas');
          f.appendText(' linked files are not treated as attachments and are not moved with the note.');
          f.createEl('br');
          f.appendText('You can add custom extensions, e.g. ');
          appendCodeBlock(f, '.foo.md');
          f.appendText(', ');
          appendCodeBlock(f, '.bar.canvas');
          f.appendText(', to override this behavior.');
          f.createEl('br');
          f.appendText('Insert each extension on a new line.');
        }),
        name: 'Treat as attachment extensions',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'treatAsAttachmentExtensions', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText(t(($) => $.pluginSettingsTab.collectAttachmentUsedByMultipleNotesMode.description.part1));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.skip.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.skip.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.move.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.move.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.copy.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.copy.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.cancel.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.cancel.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.prompt.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.prompt.description));
        }),
        name: t(($) => $.pluginSettingsTab.collectAttachmentUsedByMultipleNotesMode.name),
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              /* eslint-disable perfectionist/sort-objects -- Need to keep enum order. */
              [CollectAttachmentUsedByMultipleNotesMode.Skip]: t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.skip.displayText),
              [CollectAttachmentUsedByMultipleNotesMode.Move]: t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.move.displayText),
              [CollectAttachmentUsedByMultipleNotesMode.Copy]: t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.copy.displayText),
              [CollectAttachmentUsedByMultipleNotesMode.Cancel]: t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.cancel.displayText),
              [CollectAttachmentUsedByMultipleNotesMode.Prompt]: t(($) => $.pluginSettings.collectAttachmentUsedByMultipleNotesMode.prompt.displayText)
              /* eslint-enable perfectionist/sort-objects -- Need to keep enum order. */
            });
            this.bind({ propertyName: 'collectAttachmentUsedByMultipleNotesMode', valueComponent: dropdown });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText(t(($) => $.pluginSettingsTab.moveAttachmentToProperFolderUsedByMultipleNotesMode.description.part1));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.skip.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.skip.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.copyAll.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.copyAll.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.cancel.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.cancel.description));
          f.createEl('br');
          appendCodeBlock(f, t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.prompt.displayText));
          f.appendText(' - ');
          f.appendText(t(($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.prompt.description));
        }),
        name: t(($) => $.pluginSettingsTab.moveAttachmentToProperFolderUsedByMultipleNotesMode.name),
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              /* eslint-disable perfectionist/sort-objects -- Need to keep enum order. */
              [MoveAttachmentToProperFolderUsedByMultipleNotesMode.Skip]: t(
                ($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.skip.displayText
              ),
              [MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll]: t(
                ($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.copyAll.displayText
              ),
              [MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel]: t(
                ($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.cancel.displayText
              ),
              [MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt]: t(
                ($) => $.pluginSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode.prompt.displayText
              )
              /* eslint-enable perfectionist/sort-objects -- Need to keep enum order. */
            });
            this.bind({ propertyName: 'moveAttachmentToProperFolderUsedByMultipleNotesMode', valueComponent: dropdown });
          });
        }
      })
    ];
  }

  private async checkDangerousSetting(settingKey: keyof PluginSettings, settingName: string): Promise<void> {
    // eslint-disable-next-line unicorn/no-computed-property-existence-check -- `settingKey` is a `keyof PluginSettings`, so the lookup is statically known to exist.
    if (!(this.pluginSettingsComponent.settings[settingKey] as unknown)) {
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
