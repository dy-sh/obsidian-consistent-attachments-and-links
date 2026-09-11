import type { PluginDependency } from 'obsidian-dev-utils/obsidian/components/plugin-gate-component';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { Component } from 'obsidian';
import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { SettingsMigrationComponent } from 'obsidian-dev-utils/obsidian/components/settings-migration-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME
} from './advanced-rename-and-delete-handler.ts';
import { AttachmentCollector } from './attachment-collector.ts';
import { CheckConsistencyCommandHandler } from './command-handlers/check-consistency-command-handler.ts';
import { CollectAttachmentsEntireVaultCommandHandler } from './command-handlers/collect-attachments-entire-vault-command-handler.ts';
import { CollectAttachmentsInCurrentFolderCommandHandler } from './command-handlers/collect-attachments-in-current-folder-command-handler.ts';
import { CollectAttachmentsInFileCommandHandler } from './command-handlers/collect-attachments-in-file-command-handler.ts';
import { DeleteEmptyFoldersCommandHandler } from './command-handlers/delete-empty-folders-command-handler.ts';
import { FixIncompatiblePathsCommandHandler } from './command-handlers/fix-incompatible-paths-command-handler.ts';
import { MoveAttachmentToProperFolderCommandHandler } from './command-handlers/move-attachment-to-proper-folder-command-handler.ts';
import { ReorganizeVaultCommandHandler } from './command-handlers/reorganize-vault-command-handler.ts';
import { ConsistentAttachmentsAndLinksComponent } from './consistent-attachments-and-links-component.ts';
import { FilesHandler } from './files-handler.ts';
import { translationsMap } from './i18n/locales/translations-map.ts';
import { LinksHandler } from './links-handler.ts';
import { PathCompatibilityHandler } from './path-compatibility-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

const DEPENDENCY_REASON = 'Consistent Attachments and Links no longer handles renames and deletions itself.'
  + ' Advanced Rename and Delete Handler does: it moves a note\'s attachments with the note, and cleans up the'
  + ' attachments only a deleted note referenced.';

/**
 * The contract range of Advanced Rename and Delete Handler this plugin requires. It only ever calls
 * `migrateSettings`, which every `1.x` contract publishes.
 */
const DEPENDENCY_API_VERSION_RANGE = '^1';

export class Plugin extends PluginBase {
  protected override createTranslationsMap(): TranslationsMap {
    return translationsMap;
  }

  /**
   * Declares Advanced Rename and Delete Handler as a dependency this plugin cannot run without.
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
        pluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        pluginName: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME,
        reason: DEPENDENCY_REASON
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

    const filesHandler = new FilesHandler({
      app: this.app,
      pluginSettingsComponent
    });

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent
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

    const attachmentCollector = new AttachmentCollector({
      abortSignalComponent: this.abortSignalComponent,
      app: this.app,
      pluginName: this.manifest.name,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pluginSettingsComponent,
      resourceLockComponent: this.resourceLockComponent
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
        attachmentCollector,
        filesHandler,
        linksHandler,
        pathCompatibilityHandler,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    // TODO: Drop the disposal below once obsidian-dev-utils ties commands registered from `onloadImpl` to the
    // Feature surface. Today they go through the base's universal command component, so they outlive the
    // Surface — which unloads whenever the dependency goes away, and reloads, running this method again, when
    // It comes back. Left alone, the commands would stay in the palette calling into torn-down components.
    const commandHandlersDisposable = await this.commandHandlerComponent.registerCommandHandlers(() => [
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      }),
      new CollectAttachmentsInFileCommandHandler({
        attachmentCollector,
        pluginSettingsComponent
      }),
      new CollectAttachmentsInCurrentFolderCommandHandler(attachmentCollector),
      new CollectAttachmentsEntireVaultCommandHandler(attachmentCollector),
      new MoveAttachmentToProperFolderCommandHandler({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        attachmentCollector,
        pluginName: this.manifest.name,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        resourceLockComponent: this.resourceLockComponent
      }),
      new DeleteEmptyFoldersCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReorganizeVaultCommandHandler(consistentAttachmentsAndLinksComponent),
      new CheckConsistencyCommandHandler(consistentAttachmentsAndLinksComponent),
      new FixIncompatiblePathsCommandHandler(consistentAttachmentsAndLinksComponent)
    ]);
    // A child, so it unloads with the feature surface and takes the commands with it.
    this.addChild(new Component()).register(() => {
      commandHandlersDisposable.dispose();
    });
  }
}
