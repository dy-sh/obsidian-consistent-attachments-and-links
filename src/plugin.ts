import type { RenameDeleteHandlerSettings } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { RenameDeleteHandlerComponent } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { AttachmentCollector } from './attachment-collector.ts';
import { CheckConsistencyCommandHandler } from './command-handlers/check-consistency-command-handler.ts';
import { CollectAttachmentsEntireVaultCommandHandler } from './command-handlers/collect-attachments-entire-vault-command-handler.ts';
import { CollectAttachmentsInCurrentFolderCommandHandler } from './command-handlers/collect-attachments-in-current-folder-command-handler.ts';
import { CollectAttachmentsInFileCommandHandler } from './command-handlers/collect-attachments-in-file-command-handler.ts';
import { ConvertAllEmbedsPathsToRelativeCommandHandler } from './command-handlers/convert-all-embeds-paths-to-relative-command-handler.ts';
import { ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler } from './command-handlers/convert-all-embeds-paths-to-relative-current-note-command-handler.ts';
import { ConvertAllLinkPathsToRelativeCommandHandler } from './command-handlers/convert-all-link-paths-to-relative-command-handler.ts';
import { ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler } from './command-handlers/convert-all-link-paths-to-relative-current-note-command-handler.ts';
import { DeleteEmptyFoldersCommandHandler } from './command-handlers/delete-empty-folders-command-handler.ts';
import { MoveAttachmentToProperFolderCommandHandler } from './command-handlers/move-attachment-to-proper-folder-command-handler.ts';
import { ReorganizeVaultCommandHandler } from './command-handlers/reorganize-vault-command-handler.ts';
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler } from './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-command-handler.ts';
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler } from './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-current-note-command-handler.ts';
import { ReplaceAllWikilinksWithMarkdownLinksCommandHandler } from './command-handlers/replace-all-wikilinks-with-markdown-links-command-handler.ts';
import { ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler } from './command-handlers/replace-all-wikilinks-with-markdown-links-current-note-command-handler.ts';
import { ConsistentAttachmentsAndLinksComponent } from './consistent-attachments-and-links-component.ts';
import { FilesHandler } from './files-handler.ts';
import { translationsMap } from './i18n/locales/translations-map.ts';
import { LinksHandler } from './links-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase {
  protected override createTranslationsMap(): TranslationsMap {
    return translationsMap;
  }

  protected override onloadImpl(): void {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );

    const linksHandler = new LinksHandler({
      app: this.app,
      pluginSettingsComponent,
      resourceLockComponent: this.resourceLockComponent
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
      new RenameDeleteHandlerComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        resourceLockComponent: this.resourceLockComponent,
        settingsBuilder: (): Partial<RenameDeleteHandlerSettings> => {
          const settings = pluginSettingsComponent.settings;
          return {
            emptyFolderBehavior: settings.emptyFolderBehavior,
            isNote: (path: string): boolean => filesHandler.isNoteEx(path),
            isPathIgnored: (path: string): boolean => settings.isPathIgnored(path),
            shouldDeleteConflictingAttachments: settings.shouldDeleteExistingFilesWhenMovingNote,
            shouldHandleDeletions: settings.shouldDeleteAttachmentsWithNote,
            shouldHandleRenames: settings.shouldUpdateLinks,
            shouldRenameAttachmentFolder: settings.shouldMoveAttachmentsWithNote,
            shouldUpdateFileNameAliases: settings.shouldChangeNoteBacklinksDisplayText
          };
        }
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

    const consistentAttachmentsAndLinksComponent = this.addChild(
      new ConsistentAttachmentsAndLinksComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        attachmentCollector,
        filesHandler,
        linksHandler,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    this.commandHandlerComponent.registerCommandHandlers([
      new CollectAttachmentsInFileCommandHandler({
        attachmentCollector
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
      new ConvertAllLinkPathsToRelativeCommandHandler({
        abortSignalComponent: this.abortSignalComponent,
        consistentAttachmentsAndLinksComponent
      }),
      new ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler(consistentAttachmentsAndLinksComponent),
      new ConvertAllEmbedsPathsToRelativeCommandHandler(consistentAttachmentsAndLinksComponent),
      new ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReplaceAllWikilinksWithMarkdownLinksCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler(consistentAttachmentsAndLinksComponent),
      new ReorganizeVaultCommandHandler(consistentAttachmentsAndLinksComponent),
      new CheckConsistencyCommandHandler(consistentAttachmentsAndLinksComponent)
    ]);
  }
}
