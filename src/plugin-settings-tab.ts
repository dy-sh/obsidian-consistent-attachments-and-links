import type { SettingDefinitionItem } from 'obsidian';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import {
  PATH_COMPATIBILITY_PLATFORM_LABELS,
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from './path-compatibility.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
}

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

  // There is no row for Advanced Rename and Delete Handler: it is a declared dependency, so while it is missing
  // this tab is never registered at all and the library's own blocked tab explains what to install. Custom
  // Attachment Location is only suggested, so it does get one.
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      // The suggestion banner has to travel as a row: Obsidian renders the declarative definitions and never
      // calls `display()` once `getSettingDefinitions()` is non-empty, so there is no container to write into
      // otherwise. The row body is emptied first, leaving the Setting element as a bare host for the banner.
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
        desc: 'Specify the name of the file for the consistency report.',
        name: 'Consistency report filename',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'consistencyReportFile', valueComponent: text });
          });
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
          f.appendText('Treat files with these extensions as attachments.');
          f.createEl('br');
          f.appendText('By default, ');
          appendCodeBlock(f, '.md');
          f.appendText(' and ');
          appendCodeBlock(f, '.canvas');
          f.appendText(' linked files are not treated as attachments, so the misplaced-attachments section of the consistency report does not judge where they are.');
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
}
