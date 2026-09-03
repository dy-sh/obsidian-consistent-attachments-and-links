import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

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
import { RenameDeleteHandlerMigrationComponent } from './rename-delete-handler-migration-component.ts';

const SUGGESTION_REASON = 'Consistent Attachments and Links no longer handles renames and deletions itself.'
  + ' Without Advanced Rename and Delete Handler, moving or renaming a note leaves its attachments behind,'
  + ' and deleting one no longer cleans up the attachments only it referenced.';

export class Plugin extends PluginBase {
  protected override createTranslationsMap(): TranslationsMap {
    return translationsMap;
  }

  protected override async onloadImpl(): Promise<void> {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.pluginSettingsComponent = pluginSettingsComponent;

    const pluginSuggestionComponent = this.addChild(
      new PluginSuggestionComponent({
        app: this.app,
        isSuggestionDeclined: (): boolean => pluginSettingsComponent.settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent,
        reason: SUGGESTION_REASON,
        // `editAndSave`, not `setProperty`: a decline has to outlive a reload, and `setProperty` only edits
        // The in-memory state.
        setSuggestionDeclined: async (isDeclined): Promise<void> => {
          await pluginSettingsComponent.editAndSave((settings) => {
            settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined = isDeclined;
          });
        },
        suggestedPluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
        suggestedPluginName: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME
      })
    );

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
      new RenameDeleteHandlerMigrationComponent({
        app: this.app,
        pluginSettingsComponent,
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

    await this.commandHandlerComponent.registerCommandHandlers(() => [
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
  }
}
