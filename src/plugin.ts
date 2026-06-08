import './styles/main.scss';
import type {
  App,
  CachedMetadata,
  PluginManifest
} from 'obsidian';
import type { RenameDeleteHandlerSettings } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';

import {
  MarkdownView,
  Notice,
  setIcon,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { omitAsyncReturnType } from 'obsidian-dev-utils/function';
import { AppActiveFileProvider } from 'obsidian-dev-utils/obsidian/active-file-provider';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { PluginCommandRegistrar } from 'obsidian-dev-utils/obsidian/command-registrar';
import { MenuEventRegistrarComponent } from 'obsidian-dev-utils/obsidian/components/menu-event-registrar-component';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { RenameDeleteHandlerComponent } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import {
  getOrCreateFile,
  isMarkdownFile
} from 'obsidian-dev-utils/obsidian/file-system';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import { addToQueue } from 'obsidian-dev-utils/obsidian/queue';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from 'obsidian-dev-utils/obsidian/vault';
import { dirname } from 'obsidian-dev-utils/path';

import {
  collectAttachmentsEntireVault,
  collectAttachmentsInAbstractFiles
} from './attachment-collector.ts';
import { CheckConsistencyCommandHandler } from './command-handlers/check-consistency-command-handler.ts';
import { CollectAttachmentsEntireVaultCommandHandler } from './command-handlers/collect-attachments-entire-vault-command-handler.ts';
import { CollectAttachmentsInCurrentFolderCommandHandler } from './command-handlers/collect-attachments-in-current-folder-command-handler.ts';
import { CollectAttachmentsInFileCommandHandler } from './command-handlers/collect-attachments-in-file-command-handler.ts';
import { ConvertAllEmbedsPathsToRelativeCommandHandler } from './command-handlers/convert-all-embeds-paths-to-relative-command-handler.ts';
import {
  ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler
} from './command-handlers/convert-all-embeds-paths-to-relative-current-note-command-handler.ts';
import { ConvertAllLinkPathsToRelativeCommandHandler } from './command-handlers/convert-all-link-paths-to-relative-command-handler.ts';
import { ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler } from './command-handlers/convert-all-link-paths-to-relative-current-note-command-handler.ts';
import { DeleteEmptyFoldersCommandHandler } from './command-handlers/delete-empty-folders-command-handler.ts';
import { MoveAttachmentToProperFolderCommandHandler } from './command-handlers/move-attachment-to-proper-folder-command-handler.ts';
import { ReorganizeVaultCommandHandler } from './command-handlers/reorganize-vault-command-handler.ts';
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler } from './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-command-handler.ts';
import {
  ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler
} from './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-current-note-command-handler.ts';
import { ReplaceAllWikilinksWithMarkdownLinksCommandHandler } from './command-handlers/replace-all-wikilinks-with-markdown-links-command-handler.ts';
import {
  ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler
} from './command-handlers/replace-all-wikilinks-with-markdown-links-current-note-command-handler.ts';
import { FilesHandler } from './files-handler.ts';
import { translationsMap } from './i18n/locales/translations-map.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase {
  public readonly pluginSettingsComponent: PluginSettingsComponent;

  public get abortSignal(): AbortSignal {
    return this.abortSignalComponent.abortSignal;
  }

  private readonly deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();

  private filesHandler: FilesHandler;

  private linksHandler: LinksHandler;

  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);

    const activeFileProvider = new AppActiveFileProvider(app);
    const commandRegistrar = new PluginCommandRegistrar(this);
    const menuEventRegistrar = this.addChild(new MenuEventRegistrarComponent(app));

    this.pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );

    this.linksHandler = new LinksHandler(this);
    this.filesHandler = new FilesHandler(this, this.linksHandler);

    this.pluginSettingsComponent.on('loadSettings', (_state, isInitialLoad) => {
      if (isInitialLoad) {
        return;
      }
      this.linksHandler = new LinksHandler(this);
      this.filesHandler = new FilesHandler(this, this.linksHandler);
    });

    this.pluginSettingsComponent.on('saveSettings', () => {
      this.linksHandler = new LinksHandler(this);
      this.filesHandler = new FilesHandler(this, this.linksHandler);
    });

    const pluginSettingsTab = new PluginSettingsTab({
      plugin: this,
      pluginSettingsComponent: this.pluginSettingsComponent
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
        app,
        pluginId: this.manifest.id,
        settingsBuilder: (): Partial<RenameDeleteHandlerSettings> => {
          const { settings } = this.pluginSettingsComponent;
          return {
            emptyFolderBehavior: settings.emptyFolderBehavior,
            isNote: (path: string): boolean => this.filesHandler.isNoteEx(path),
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

    this.addChild(
      new CommandHandlerComponent({
        activeFileProvider,
        commandHandlers: [
          new CollectAttachmentsInFileCommandHandler(this),
          new CollectAttachmentsInCurrentFolderCommandHandler(this),
          new CollectAttachmentsEntireVaultCommandHandler(this),
          new MoveAttachmentToProperFolderCommandHandler(this),
          new DeleteEmptyFoldersCommandHandler(this),
          new ConvertAllLinkPathsToRelativeCommandHandler(this),
          new ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler(this),
          new ConvertAllEmbedsPathsToRelativeCommandHandler(this),
          new ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler(this),
          new ReplaceAllWikilinksWithMarkdownLinksCommandHandler(this),
          new ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler(this),
          new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler(this),
          new ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler(this),
          new ReorganizeVaultCommandHandler(this),
          new CheckConsistencyCommandHandler(this)
        ],
        commandRegistrar,
        menuEventRegistrar,
        pluginName: this.manifest.name
      })
    );

    invokeAsyncSafely(() => this.initI18n());
    this.initLayoutReadyHandlers();
  }

  public async checkConsistency(): Promise<void> {
    await this.saveAllOpenNotes();

    const badLinks = new ConsistencyCheckResult('Bad links');
    const badEmbeds = new ConsistencyCheckResult('Bad embeds');
    const wikiLinks = new ConsistencyCheckResult('Wiki links');
    const wikiEmbeds = new ConsistencyCheckResult('Wiki embeds');
    const badFrontmatterLinks = new ConsistencyCheckResult('Bad frontmatter links');
    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Checking note ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        await this.linksHandler.checkConsistency(note, badLinks, badEmbeds, wikiLinks, wikiEmbeds, badFrontmatterLinks);
      },
      progressBarTitle: 'Consistent Attachments and Links: Checking vault consistency...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    const notePath = this.pluginSettingsComponent.settings.consistencyReportFile;

    const text = [badLinks, badEmbeds, wikiLinks, wikiEmbeds, badFrontmatterLinks]
      .map((result) => result.toString(this.app, notePath))
      .join('');
    await createFolderSafe(this.app, dirname(notePath));
    const note = await getOrCreateFile(this.app, notePath);
    await this.app.vault.modify(note, text);

    let fileOpened = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getDisplayText() !== '' && notePath.startsWith(leaf.getDisplayText())) {
        fileOpened = true;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Can change in await calls.
    if (!fileOpened) {
      await this.app.workspace.openLinkText(notePath, '/', false);
    }
  }

  public async convertAllEmbedsPathsToRelative(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedEmbedCount = 0;
    let processedNotesCount = 0;

    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Converting embed paths to relative ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.convertAllNoteEmbedsPathsToRelative(note.path, this.abortSignal);

        if (result.length > 0) {
          changedEmbedCount += result.length;
          processedNotesCount++;
        }
      },
      progressBarTitle: 'Consistent Attachments and Links: Converting embed paths to relative...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    if (changedEmbedCount === 0) {
      new Notice('No embeds found that need to be converted');
    } else {
      new Notice(
        `Converted ${String(changedEmbedCount)} embed${changedEmbedCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  public convertAllEmbedsPathsToRelativeCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignal,
      app: this.app,
      operationFn: omitAsyncReturnType((abortSignal) => this.linksHandler.convertAllNoteEmbedsPathsToRelative(note.path, abortSignal)),
      operationName: 'Convert all embed paths to relative in current note'
    });
  }

  public async convertAllLinkPathsToRelative(abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    await this.saveAllOpenNotes();
    abortSignal.throwIfAborted();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    await loop({
      abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Converting link paths to relative ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.convertAllNoteLinksPathsToRelative(note.path, abortSignal);

        if (result.length > 0) {
          changedLinksCount += result.length;
          processedNotesCount++;
        }
      },
      progressBarTitle: 'Consistent Attachments and Links: Converting link paths to relative...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    if (changedLinksCount === 0) {
      new Notice('No links found that need to be converted');
    } else {
      new Notice(
        `Converted ${String(changedLinksCount)} link${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  public convertAllLinkPathsToRelativeCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignal,
      app: this.app,
      operationFn: omitAsyncReturnType((abortSignal) => this.linksHandler.convertAllNoteLinksPathsToRelative(note.path, abortSignal)),
      operationName: 'Convert all link paths to relative in current note'
    });
  }

  public async deleteEmptyFolders(): Promise<void> {
    await this.filesHandler.deleteEmptyFolders('/');
  }

  public async reorganizeVault(): Promise<void> {
    await this.saveAllOpenNotes();

    await this.replaceAllWikilinksWithMarkdownLinks();
    await this.replaceAllWikiEmbedsWithMarkdownEmbeds();
    await this.convertAllEmbedsPathsToRelative();
    await this.convertAllLinkPathsToRelative(this.abortSignal);
    collectAttachmentsEntireVault(this);
    await this.deleteEmptyFolders();
    new Notice('Reorganization of the vault completed');
  }

  public async replaceAllWikiEmbedsWithMarkdownEmbeds(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Replacing wiki embeds with markdown embeds ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true, this.abortSignal);
        changedLinksCount += result;
        processedNotesCount++;
      },
      progressBarTitle: 'Consistent Attachments and Links: Replacing wiki embeds with markdown embeds...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    if (changedLinksCount === 0) {
      new Notice('No wiki embeds found that need to be replaced');
    } else {
      new Notice(
        `Replaced ${String(changedLinksCount)} wiki embed${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  public replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignal,
      app: this.app,
      operationFn: omitAsyncReturnType((abortSignal) => this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true, abortSignal)),
      operationName: 'Replace all wiki embeds with markdown embeds in current note'
    });
  }

  public async replaceAllWikilinksWithMarkdownLinks(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Replacing wikilinks with markdown links ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, this.abortSignal);
        changedLinksCount += result;
        processedNotesCount++;
      },
      progressBarTitle: 'Consistent Attachments and Links: Replacing wikilinks with markdown links...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    if (changedLinksCount === 0) {
      new Notice('No wiki links found that need to be replaced');
    } else {
      new Notice(
        `Replaced ${String(changedLinksCount)} wikilink${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  public replaceAllWikilinksWithMarkdownLinksCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignal,
      app: this.app,
      operationFn: omitAsyncReturnType((abortSignal) => this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, abortSignal)),
      operationName: 'Replace all wiki embeds with markdown embeds in current note'
    });
  }

  private handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void {
    if (
      !this.pluginSettingsComponent.settings.shouldDeleteAttachmentsWithNote || this.pluginSettingsComponent.settings.isPathIgnored(file.path)
      || !isMarkdownFile(this.app, file)
    ) {
      return;
    }

    this.deletedNoteCache.set(file.path, prevCache);
  }

  private handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): void {
    abortSignal.throwIfAborted();
    if (!this.pluginSettingsComponent.settings.shouldCollectAttachmentsAutomatically) {
      return;
    }

    const suggestionContainer = activeDocument.querySelector<HTMLDivElement>('.suggestion-container');
    if (suggestionContainer?.isShown()) {
      return;
    }

    collectAttachmentsInAbstractFiles(this, [file]);
  }

  private async initI18n(): Promise<void> {
    await initI18N(translationsMap);
  }

  private initLayoutReadyHandlers(): void {
    this.app.workspace.onLayoutReady(() => {
      invokeAsyncSafely(() => this.showBackupWarning());

      this.registerEvent(
        this.app.metadataCache.on('deleted', (file, prevCache) => {
          if (prevCache) {
            this.handleDeletedMetadata(file, prevCache);
          }
        })
      );

      this.registerEvent(this.app.metadataCache.on('changed', (file) => {
        addToQueue({
          abortSignal: this.abortSignal,
          app: this.app,
          operationFn: (abortSignal) => {
            this.handleMetadataCacheChanged(file, abortSignal);
          },
          operationName: 'handleMetadataCacheChanged'
        });
      }));
    });
  }

  private async saveAllOpenNotes(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) {
        await leaf.view.save();
      }
    }
  }

  private async showBackupWarning(): Promise<void> {
    if (!this.pluginSettingsComponent.settings.shouldShowBackupWarning) {
      return;
    }

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.revertDangerousSettings();
    });

    await alert({
      app: this.app,
      message: createFragment((f) => {
        f.createDiv({ cls: 'community-modal-readme' }, (wrapper) => {
          wrapper.appendText(
            'Using \'Consistent Attachments and Links\' plugin without proper configuration might lead to inconvenient attachment rearrangements or even data loss in your vault.'
          );
          wrapper.createEl('br');
          wrapper.appendText('It is ');
          wrapper.createEl('strong', { text: 'STRONGLY' });
          wrapper.appendText(' recommended to backup your vault before using the plugin.');
          wrapper.createEl('br');
          if (this.pluginSettingsComponent.settings.hadDangerousSettingsReverted) {
            wrapper.appendText('Some of your plugin settings has been changed to their safe values.');
            wrapper.createEl('br');
          }
          wrapper.createEl('a', { href: 'https://github.com/dy-sh/obsidian-consistent-attachments-and-links?tab=readme-ov-file', text: 'Read more' });
          wrapper.appendText(' about how to use the plugin.');
          wrapper.createEl('br');
          wrapper.appendText('This warning will not appear again.');
        });
      }),
      title: createFragment((f) => {
        setIcon(f.createSpan(), 'triangle-alert');
        f.appendText(' Consistent Attachments and Links');
      })
    });

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.shouldShowBackupWarning = false;
    });
  }
}
