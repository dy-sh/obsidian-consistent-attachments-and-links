import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { setIcon } from 'obsidian';
import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import {
  PATH_COMPATIBILITY_PLATFORM_LABELS,
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from './path-compatibility.ts';
import {
  CollectAttachmentUsedByMultipleNotesMode,
  MoveAttachmentToProperFolderUsedByMultipleNotesMode
} from './plugin-settings.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
}

const AUTO_COLLECT_ATTACHMENTS_SETTING_NAME = 'Auto Collect Attachments';

/**
 * What each platform's toggle actually enforces. They differ enough that one shared sentence would be wrong
 * for four of the five: only Windows has a path budget a vault runs into, and only ext4 counts bytes.
 */
const PATH_COMPATIBILITY_PLATFORM_DESCRIPTIONS = {
  [PathCompatibilityPlatform.Android]: 'Names of at most 255 bytes. A name of 128 CJK characters is 384 bytes, so this bites long before any character count does.',
  [PathCompatibilityPlatform.Ios]: 'Names of at most 255 bytes, and paths of at most 1024.',
  [PathCompatibilityPlatform.Linux]: 'Names of at most 255 bytes.',
  [PathCompatibilityPlatform.MacOs]: 'Names of at most 255 bytes, and paths of at most 1024.',
  [PathCompatibilityPlatform.Windows]: 'Paths of at most 259 characters for a file and 247 for a folder, no reserved name (CON, PRN, AUX, NUL, COM1-9, LPT1-9), no <>:"|?* and no trailing dot or space.'
} as const satisfies Record<PathCompatibilityPlatform, string>;

const PATH_COMPATIBILITY_PLATFORM_PROPERTY_NAMES = {
  [PathCompatibilityPlatform.Android]: 'shouldEnsurePathCompatibilityOnAndroid',
  [PathCompatibilityPlatform.Ios]: 'shouldEnsurePathCompatibilityOnIos',
  [PathCompatibilityPlatform.Linux]: 'shouldEnsurePathCompatibilityOnLinux',
  [PathCompatibilityPlatform.MacOs]: 'shouldEnsurePathCompatibilityOnMacOs',
  [PathCompatibilityPlatform.Windows]: 'shouldEnsurePathCompatibilityOnWindows'
} as const satisfies Record<PathCompatibilityPlatform, keyof PluginSettings>;

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly pluginSuggestionComponent: PluginSuggestionComponent;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.pluginSuggestionComponent = params.pluginSuggestionComponent;
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      // The suggestion banner has to travel as a row: Obsidian renders the declarative definitions and never
      // Calls `display()` once `getSettingDefinitions()` is non-empty, so there is no container to write into
      // Otherwise. The row body is emptied first, leaving the Setting element as a bare host for the banner.
      this.settingEx({
        name: '',
        render: (setting) => {
          setting.settingEl.empty();
          this.pluginSuggestionComponent.renderBanner(setting.settingEl);
        },
        searchable: false,
        visible: () => this.pluginSuggestionComponent.getSuggestedPluginState() !== SuggestedPluginState.Enabled
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
          f.appendText('Treat the following folders as a single attachment. When ');
          appendCodeBlock(f, 'Collect attachments');
          f.appendText(' moves an attachment from one of them, the whole folder moves along with it.');
          f.createEl('br');
          f.appendText('Use this for attachments that are really a folder: a saved page next to its files folder, a drawing next to the images it references.');
          f.createEl('br');
          f.appendText('Insert each path on a new line');
          f.createEl('br');
          f.appendText('You can use path string or ');
          appendCodeBlock(f, '/regular expression/');
          f.createEl('br');
          f.appendText('A plain path is matched from the vault root. To match a folder name wherever it appears, use a regular expression.');
          f.createEl('br');
          f.appendText('If the setting is empty, every attachment is moved on its own, which is the behavior without this setting.');
        }),
        name: 'Attachment unit folders',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'attachmentUnitFolderPaths', valueComponent: multipleText });
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
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Enforce every platform\'s naming rules at once, whatever the individual toggles below say.');
          f.createEl('br');
          f.appendText('Use this when you do not want to reason about which devices this vault reaches.');
        }),
        name: 'Ensure path compatibility on every platform',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldEnsurePathCompatibilityOnEveryPlatform', valueComponent: toggle }));
        }
      }),
      ...PATH_COMPATIBILITY_PLATFORMS.map((platform) =>
        this.settingEx({
          desc: PATH_COMPATIBILITY_PLATFORM_DESCRIPTIONS[platform],
          name: `Ensure path compatibility on ${PATH_COMPATIBILITY_PLATFORM_LABELS[platform]}`,
          render: (setting) => {
            setting.addToggle((toggle) => this.bind({ propertyName: PATH_COMPATIBILITY_PLATFORM_PROPERTY_NAMES[platform], valueComponent: toggle }));
          }
        })
      ),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('The length, in characters, of the longest vault root path this vault is expected to live under.');
          f.createEl('br');
          f.appendText('Leave it at ');
          appendCodeBlock(f, '0');
          f.appendText(' to use this machine\'s real vault root, which makes the check exact here.');
          f.createEl('br');
          f.appendText(
            'The root of a device you are not running on cannot be known, so state it: set this to the length of the deepest place this vault is synced to. A value below the real root\'s length is reported as a warning, because every path check is then stricter than this machine requires.'
          );
        }),
        name: 'Maximum vault root path length',
        render: (setting) => {
          setting.addNumber((number) => {
            this.bind({ propertyName: 'maxVaultRootPathLength', valueComponent: number });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Names the sidecar note that carries an attachment\'s original name, once the attachment has been renamed.');
          f.createEl('br');
          f.appendText('Tokens: ');
          appendCodeBlock(f, '{{fileName}}');
          f.appendText(' (the whole name, extension included), ');
          appendCodeBlock(f, '{{basename}}');
          f.appendText(', ');
          appendCodeBlock(f, '{{extension}}');
          f.appendText('.');
          f.createEl('br');
          f.appendText('The default makes ');
          appendCodeBlock(f, 'diagram.png');
          f.appendText(' answer ');
          appendCodeBlock(f, 'diagram.png.md');
          f.appendText(', which cannot collide with a real note the way ');
          appendCodeBlock(f, '{{basename}}.md');
          f.appendText(' can.');
        }),
        name: 'Sidecar note name',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'sidecarNoteNamePattern', valueComponent: text });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When a renamed item has no note to record its original name in, create one.');
          f.createEl('br');
          f.appendText(
            'Off by default: a folder with no folder note, and an attachment with no sidecar note, are listed in the consistency report instead, and nothing new appears on disk.'
          );
        }),
        name: 'Create a note to preserve the original name',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldCreateNoteToPreserveOriginalName', valueComponent: toggle }));
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
