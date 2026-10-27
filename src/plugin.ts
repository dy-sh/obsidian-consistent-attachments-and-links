import type { PluginDependency } from '@mnaoumov/obsidian-lib/components/plugin-gate-component';
import type { TranslationsMap } from '@mnaoumov/obsidian-lib/i18n/i18n';

import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from '@mnaoumov/obsidian-lib/components/plugin-settings-tab-component';
import { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { SettingsMigrationComponent } from '@mnaoumov/obsidian-lib/components/settings-migration-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { PluginBase } from '@mnaoumov/obsidian-lib/plugin/plugin';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';

import type { MigratableSettings } from './sibling-plugins/advanced-rename-and-delete-handler.ts';
import type { MigratableCollectSettings } from './sibling-plugins/custom-attachment-location.ts';

import { BrokenLinkFixer } from './broken-links/broken-link-fixer.ts';
import { BrokenLinksViewComponent } from './broken-links/broken-links-view-component.ts';
import { CheckConsistencyCommandHandler } from './command-handlers/check-consistency-command-handler.ts';
import { FixBrokenLinksCommandHandler } from './command-handlers/fix-broken-links-command-handler.ts';
import { FixIncompatiblePathsCommandHandler } from './command-handlers/fix-incompatible-paths-command-handler.ts';
import { ConsistentAttachmentsAndLinksComponent } from './consistency-check/consistent-attachments-and-links-component.ts';
import { LinksHandler } from './consistency-check/links-handler.ts';
import { translationsMap } from './i18n/locales/translations-map.ts';
import { MisplacedAttachmentHandler } from './misplaced-attachments/misplaced-attachment-handler.ts';
import { PathCompatibilityHandler } from './path-compatibility/path-compatibility-handler.ts';
import { PluginSettingsComponent } from './settings/plugin-settings-component.ts';
import { PluginSettingsTab } from './settings/plugin-settings-tab.ts';
import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME
} from './sibling-plugins/advanced-rename-and-delete-handler.ts';
import {
  CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
  CUSTOM_ATTACHMENT_LOCATION_PLUGIN_NAME
} from './sibling-plugins/custom-attachment-location.ts';

const PLUGIN_NAME = 'Consistent Attachments and Links';

/**
 * The contract range of `Advanced Rename and Delete Handler` this plugin requires. It only ever calls
 * `migrateSettings`, which every `1.x` contract publishes.
 */
const DEPENDENCY_API_VERSION_RANGE = '^1';

/**
 * The first `Advanced Rename and Delete Handler` release built on `@mnaoumov/obsidian-lib` 6, the major that moved
 * the plugin-API registry from `globalThis.__obsidianDevUtils` to `globalThis.__obsidianLib`. Up to 3.0.0 it
 * publishes into the old bag, which this plugin never reads, so the gate would see an enabled plugin with no API and
 * say it is not installed. Asking for `3.0.1` turns that into the gate's "update this plugin" message, with the
 * button that does it.
 */
const DEPENDENCY_MIN_PLUGIN_VERSION = '3.0.1';

/**
 * The contract range of `Custom Attachment Location` the collect handover needs: `migrateSettings` arrived in
 * its contract `1.1.0`, the one its 13.0.0 publishes.
 */
const COLLECT_MIGRATION_API_VERSION_RANGE = '^1.1.0';

export class Plugin extends PluginBase {
  protected override createTranslationsMap(): TranslationsMap {
    return translationsMap;
  }

  /**
   * Declares `Advanced Rename and Delete Handler` as a dependency this plugin cannot run without.
   *
   * It owns renames and deletions since this plugin's 4.0.0. Without it, attachments silently stop following
   * their notes — and nothing would connect that to a plugin removed weeks earlier. Declared, this plugin does
   * nothing while it is missing, says why, and installs it in one click.
   *
   * @returns The dependency.
   */
  protected override getPluginDependencies(): PluginDependency[] {
    return [
      {
        apiVersionRange: DEPENDENCY_API_VERSION_RANGE,
        minPluginVersion: DEPENDENCY_MIN_PLUGIN_VERSION,
        pluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        pluginName: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME,
        reason: createDependencyReason()
      }
    ];
  }

  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    const linksHandler = new LinksHandler({
      app: this.app,
      pluginSettingsComponent
    });

    // A suggestion, not a dependency like `Advanced Rename and Delete Handler`: every feature left here works
    // without `Custom Attachment Location`, which only takes over what this plugin no longer does.
    const pluginSuggestionComponent = this.addChild(
      new PluginSuggestionComponent({
        app: this.app,
        // Only a user who had collect settings to hand over is asked on load. A fresh install never used
        // collecting here, so it gets the settings-tab banner and no notice.
        isSuggestionDeclined: (): boolean =>
          pluginSettingsComponent.settings.isCustomAttachmentLocationSuggestionDeclined
          || pluginSettingsComponent.settings.proposedCollectSettings === null,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        reason: createSuggestionReason(),
        // `editAndSave`, not `setProperty`: a decline has to outlive a reload, and `setProperty` only edits
        // the in-memory state.
        setSuggestionDeclined: async (isDeclined): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.isCustomAttachmentLocationSuggestionDeclined = isDeclined;
          });
        },
        suggestedPluginId: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
        suggestedPluginName: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_NAME
      })
    );

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent,
      pluginSuggestionComponent
    });

    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab
      })
    );

    this.addChild(
      new SettingsMigrationComponent<MigratableSettings>({
        apiVersionRange: DEPENDENCY_API_VERSION_RANGE,
        app: this.app,
        getProposedSettings: (): MigratableSettings | null => pluginSettingsComponent.settings.proposedRenameDeleteSettings,
        pluginSettingsComponent,
        providerPluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        retireProposedSettings: async (): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.proposedRenameDeleteSettings = null;
          });
        },
        sourcePluginId: this.manifest.id
      })
    );

    this.addChild(
      new SettingsMigrationComponent<MigratableCollectSettings>({
        apiVersionRange: COLLECT_MIGRATION_API_VERSION_RANGE,
        app: this.app,
        getProposedSettings: (): MigratableCollectSettings | null => pluginSettingsComponent.settings.proposedCollectSettings,
        pluginSettingsComponent,
        providerPluginId: CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID,
        retireProposedSettings: async (): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.proposedCollectSettings = null;
          });
        },
        sourcePluginId: this.manifest.id
      })
    );

    const misplacedAttachmentHandler = new MisplacedAttachmentHandler({
      app: this.app,
      pluginSettingsComponent
    });

    const pathCompatibilityHandler = new PathCompatibilityHandler({
      abortSignalComponent: this.abortSignalComponent,
      app: this.app,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pluginSettingsComponent,
      resourceLockComponent: this.resourceLockComponent
    });

    const consistentAttachmentsAndLinksComponent = this.addChild(
      new ConsistentAttachmentsAndLinksComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        linksHandler,
        misplacedAttachmentHandler,
        pathCompatibilityHandler,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    const brokenLinkFixer = new BrokenLinkFixer({
      abortSignalComponent: this.abortSignalComponent,
      app: this.app,
      linksHandler,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pluginSettingsComponent,
      resourceLockComponent: this.resourceLockComponent
    });

    this.addChild(
      new BrokenLinksViewComponent({
        app: this.app,
        brokenLinkFixer,
        pluginNoticeComponent: this.pluginNoticeComponent
      })
    );

    await this.commandHandlerComponent.registerCommandHandlers(() => [
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      }),
      new CheckConsistencyCommandHandler(consistentAttachmentsAndLinksComponent),
      new FixBrokenLinksCommandHandler(this.app),
      new FixIncompatiblePathsCommandHandler(consistentAttachmentsAndLinksComponent)
    ]);
  }
}

// Fragments, not strings, so every plugin name renders as code. The library clones a fragment each time it shows
// one, so the notice and the settings tab can share it.
function createDependencyReason(): DocumentFragment {
  return createFragment((f) => {
    appendCodeBlock(f, PLUGIN_NAME);
    f.appendText(' no longer handles renames and deletions itself. ');
    appendCodeBlock(f, ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME);
    f.appendText(
      ' does: it moves a note\'s attachments with the note, and cleans up the attachments only a deleted note'
        + ' referenced.'
    );
  });
}

function createSuggestionReason(): DocumentFragment {
  return createFragment((f) => {
    appendCodeBlock(f, PLUGIN_NAME);
    f.appendText(' no longer collects attachments. ');
    appendCodeBlock(f, CUSTOM_ATTACHMENT_LOCATION_PLUGIN_NAME);
    f.appendText(
      ' does: it collects a note\'s attachments into the note\'s attachment folder, on command or as you'
        + ' edit, and moves a misplaced attachment to its proper folder.'
    );
  });
}
