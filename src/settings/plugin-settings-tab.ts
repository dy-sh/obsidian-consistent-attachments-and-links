import type { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import type { SettingDefinitionItem } from 'obsidian';

import { SuggestedPluginState } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

import {
  PATH_COMPATIBILITY_PLATFORM_LABELS,
  PATH_COMPATIBILITY_PLATFORMS,
  PathCompatibilityPlatform
} from '../path-compatibility/path-compatibility.ts';
import { ExternalAttachmentLinkMode } from './plugin-settings.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
}

/**
 * What each platform's toggle actually enforces. They differ enough that one shared sentence would be wrong
 * for four of the five: only Windows has a path budget a vault runs into, and only ext4 counts bytes.
 */
const PATH_COMPATIBILITY_PLATFORM_DESCRIPTIONS = {
  [PathCompatibilityPlatform.Android]: 'Names of at most 255 bytes. A name of 128 CJK characters is 384 bytes, so this bites long before any character count does. No <>:"?*, which shared storage refuses.',
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

  // There is no row for `Advanced Rename and Delete Handler`: it is a declared dependency, so while it is missing
  // this tab is never registered at all and the library's own blocked tab explains what to install. `Custom
  // Attachment Location` is only suggested, so it does get one.
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
          appendPathSyntax(f);
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
          appendPathSyntax(f);
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
          f.appendText('What the consistency report does when a note links an attachment outside its own attachment folder.');
          f.createEl('br');
          appendCodeBlock(f, 'Report');
          f.appendText(' - list every such link, even when the attachment sits in the folder of another note that uses it too.');
          f.createEl('br');
          appendCodeBlock(f, 'Report unowned');
          f.appendText(' - list it only when no note that uses the attachment has it in its own folder.');
          f.createEl('br');
          appendCodeBlock(f, 'Ignore');
          f.appendText(' - never list it; the misplaced-attachments section is skipped.');
        }),
        name: 'Links to attachments outside the note\'s folder',
        render: (setting) => {
          setting.addDropdown((dropdown) => {
            dropdown.addOptions({
              /* eslint-disable perfectionist/sort-objects -- Need to keep order. */
              [ExternalAttachmentLinkMode.Report]: 'Report',
              [ExternalAttachmentLinkMode.ReportUnowned]: 'Report unowned',
              [ExternalAttachmentLinkMode.Ignore]: 'Ignore'
              /* eslint-enable perfectionist/sort-objects -- Need to keep order. */
            });
            this.bind({ propertyName: 'externalAttachmentLinkMode', valueComponent: dropdown });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Folders where any note may keep attachments, e.g. ');
          appendCodeBlock(f, '_assets/common');
          f.appendText('. A link into one of them, or anything under it, is never reported as misplaced.');
          f.createEl('br');
          f.appendText('Insert each path on a new line');
          f.createEl('br');
          appendPathSyntax(f);
        }),
        name: 'Shared attachment locations',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'sharedAttachmentPaths', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('The file names your folder notes are stored under, e.g. ');
          appendCodeBlock(f, 'index.md');
          f.appendText('.');
          f.createEl('br');
          f.appendText('Such a name says nothing about which note it is, so ');
          appendCodeBlock(f, 'Fix broken links');
          f.appendText(' recognizes a moved folder note by its folder\'s name too, and looks for the folder\'s old name in aliases.');
          f.createEl('br');
          f.appendText('Insert each file name on a new line.');
        }),
        name: 'Folder note file names',
        render: (setting) => {
          setting.addMultipleText((multipleText) => {
            this.bind({ propertyName: 'folderNoteFileNames', valueComponent: multipleText });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When the vault is in a git repository, ');
          appendCodeBlock(f, 'Fix broken links');
          f.appendText(' reads the renames in its history to find where a missing target went. Desktop only.');
        }),
        name: 'Use git history to find renamed targets',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldUseGitHistoryForBrokenLinks', valueComponent: toggle }));
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When the vault is in a git repository, every run of ');
          appendCodeBlock(f, 'Fix incompatible paths');
          f.appendText(' and ');
          appendCodeBlock(f, 'Fix broken links');
          f.appendText(' is committed on its own, so one ');
          appendCodeBlock(f, 'git revert');
          f.appendText(' or the ');
          appendCodeBlock(f, 'Undo a bulk operation...');
          f.appendText(' command undoes it. Desktop only.');
        }),
        name: 'Commit bulk operations to git',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldCommitBulkOperations', valueComponent: toggle }));
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
          f.appendText('Report, and repair with ');
          appendCodeBlock(f, 'Fix incompatible paths');
          f.appendText(', every name stored on disk in decomposed Unicode form (NFD), such as ');
          appendCodeBlock(f, 'й');
          f.appendText(' stored as ');
          appendCodeBlock(f, 'и');
          f.appendText(' followed by a combining breve.');
          f.createEl('br');
          f.appendText(
            'Obsidian shows such a name exactly like its composed form (NFC), but sync, git and backup tools see two different names. Such names come from outside Obsidian, for example from older macOS disks. The repair keeps the name and only changes how it is stored.'
          );
        }),
        name: 'Normalize Unicode names to NFC',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldNormalizeUnicodeNames', valueComponent: toggle }));
        }
      }),
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
          setting.addNumber(($number) => {
            this.bind({ propertyName: 'maxVaultRootPathLength', valueComponent: $number });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('What ');
          appendCodeBlock(f, 'Fix incompatible paths');
          f.appendText(' replaces each forbidden character in a name with, such as ');
          appendCodeBlock(f, '-');
          f.appendText(' or ');
          appendCodeBlock(f, '_');
          f.appendText('.');
          f.createEl('br');
          f.appendText('Leave it empty to delete the character instead. The replacement itself must be valid in a file name on every platform.');
        }),
        name: 'Forbidden character replacement',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'forbiddenCharacterReplacement', valueComponent: text });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('When an item is renamed, add its original name to the ');
          appendCodeBlock(f, 'aliases');
          f.appendText(' of the note that describes it.');
          f.createEl('br');
          f.appendText('The original name is also written to ');
          appendCodeBlock(f, 'title');
          f.appendText(' when the note has none; a title the note already has is never changed. Turn this off if your notes keep their true name in ');
          appendCodeBlock(f, 'title');
          f.appendText(' and you do not want an alias repeating it.');
        }),
        name: 'Add the original name as an alias',
        render: (setting) => {
          setting.addToggle((toggle) => this.bind({ propertyName: 'shouldAddOriginalNameAsAlias', valueComponent: toggle }));
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

function appendPathSyntax(f: DocumentFragment): void {
  f.appendText('Each entry is a path, a glob such as ');
  appendCodeBlock(f, '*.pdf');
  f.appendText(' or ');
  appendCodeBlock(f, 'Attachments/**/*.png');
  f.appendText(', or a ');
  appendCodeBlock(f, '/regular expression/flags');
  f.createEl('br');
  f.appendText('Matching is case-insensitive. Escape a literal ');
  appendCodeBlock(f, '*');
  f.appendText(', ');
  appendCodeBlock(f, '?');
  f.appendText(' or ');
  appendCodeBlock(f, '[');
  f.appendText(' in a path with ');
  appendCodeBlock(f, '\\');
}
