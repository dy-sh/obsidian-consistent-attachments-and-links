import type { CachedMetadata } from 'obsidian';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import type { PluginSettingsWrapper } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsWrapper';
import type { RenameDeleteHandlerSettings } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import type { ReadonlyDeep } from 'type-fest';

import {
  MarkdownView,
  Notice,
  setIcon,
  TFile
} from 'obsidian';
import { omitAsyncReturnType } from 'obsidian-dev-utils/Function';
import {
  getOrCreateFile,
  isMarkdownFile
} from 'obsidian-dev-utils/obsidian/FileSystem';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { alert } from 'obsidian-dev-utils/obsidian/Modals/Alert';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { addToQueue } from 'obsidian-dev-utils/obsidian/Queue';
import { registerRenameDeleteHandlers } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from 'obsidian-dev-utils/obsidian/Vault';
import { dirname } from 'obsidian-dev-utils/Path';

import type { PluginSettings } from './PluginSettings.ts';
import type { PluginTypes } from './PluginTypes.ts';

import {
  collectAttachmentsEntireVault,
  collectAttachmentsInAbstractFiles
} from './AttachmentCollector.ts';
import { CheckConsistencyCommand } from './Commands/CheckConsistencyCommand.ts';
import { CollectAttachmentsEntireVaultCommand } from './Commands/CollectAttachmentsEntireVaultCommand.ts';
import { CollectAttachmentsInCurrentFolderCommand } from './Commands/CollectAttachmentsInCurrentFolderCommand.ts';
import { CollectAttachmentsInFileCommand } from './Commands/CollectAttachmentsInFileCommand.ts';
import { ConvertAllEmbedsPathsToRelativeCommand } from './Commands/ConvertAllEmbedsPathsToRelativeCommand.ts';
import { ConvertAllEmbedsPathsToRelativeCurrentNoteCommand } from './Commands/ConvertAllEmbedsPathsToRelativeCurrentNoteCommand.ts';
import { ConvertAllLinkPathsToRelativeCommand } from './Commands/ConvertAllLinkPathsToRelativeCommand.ts';
import { ConvertAllLinkPathsToRelativeCurrentNoteCommand } from './Commands/ConvertAllLinkPathsToRelativeCurrentNoteCommand.ts';
import { DeleteEmptyFoldersCommand } from './Commands/DeleteEmptyFoldersCommand.ts';
import { MoveAttachmentToProperFolderCommand } from './Commands/MoveAttachmentToProperFolderCommand.ts';
import { ReorganizeVaultCommand } from './Commands/ReorganizeVaultCommand.ts';
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCommand } from './Commands/ReplaceAllWikiEmbedsWithMarkdownEmbedsCommand.ts';
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommand } from './Commands/ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommand.ts';
import { ReplaceAllWikilinksWithMarkdownLinksCommand } from './Commands/ReplaceAllWikilinksWithMarkdownLinksCommand.ts';
import { ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommand } from './Commands/ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommand.ts';
import { FilesHandler } from './files-handler.ts';
import { translationsMap } from './i18n/locales/translationsMap.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';
import { PluginSettingsManager } from './PluginSettingsManager.ts';
import { PluginSettingsTab } from './PluginSettingsTab.ts';

export class Plugin extends PluginBase<PluginTypes> {
  private readonly deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();

  private linksHandler: LinksHandler = new LinksHandler(this);
  private filesHandler: FilesHandler = new FilesHandler(this, this.linksHandler);

  public async checkConsistency(): Promise<void> {
    await this.saveAllOpenNotes();

    const badLinks = new ConsistencyCheckResult('Bad links');
    const badEmbeds = new ConsistencyCheckResult('Bad embeds');
    const wikiLinks = new ConsistencyCheckResult('Wiki links');
    const wikiEmbeds = new ConsistencyCheckResult('Wiki embeds');
    const badFrontmatterLinks = new ConsistencyCheckResult('Bad frontmatter links');
    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Checking note ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        await this.linksHandler.checkConsistency(note, badLinks, badEmbeds, wikiLinks, wikiEmbeds, badFrontmatterLinks);
      },
      progressBarTitle: 'Consistent Attachments and Links: Checking vault consistency...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    const notePath = this.settings.consistencyReportFile;

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
        if (this.settings.isPathIgnored(note.path)) {
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
        if (this.settings.isPathIgnored(note.path)) {
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

  public override async onLoadSettings(loadedSettings: ReadonlyDeep<PluginSettingsWrapper<PluginSettings>>, isInitialLoad: boolean): Promise<void> {
    await super.onLoadSettings(loadedSettings, isInitialLoad);
    loadedSettings.settings.revertDangerousSettings();
  }

  public override async onSaveSettings(
    newSettings: ReadonlyDeep<PluginSettingsWrapper<PluginSettings>>,
    oldSettings: ReadonlyDeep<PluginSettingsWrapper<PluginSettings>>,
    context?: unknown
  ): Promise<void> {
    await super.onSaveSettings(newSettings, oldSettings, context);
    this.linksHandler = new LinksHandler(this);
    this.filesHandler = new FilesHandler(this, this.linksHandler);
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
        if (this.settings.isPathIgnored(note.path)) {
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
        if (this.settings.isPathIgnored(note.path)) {
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

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this);
  }

  protected override createSettingsTab(): null | PluginSettingsTab {
    return new PluginSettingsTab(this);
  }

  protected override createTranslationsMap(): TranslationsMap<PluginTypes> {
    return translationsMap;
  }

  protected override async onLayoutReady(): Promise<void> {
    await this.showBackupWarning();

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
        operationFn: (abortSignal) => this.handleMetadataCacheChanged(file, abortSignal),
        operationName: 'handleMetadataCacheChanged'
      });
    }));
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    registerRenameDeleteHandlers(this, () => {
      const settings: Partial<RenameDeleteHandlerSettings> = {
        emptyFolderBehavior: this.settings.emptyFolderBehavior,
        isNote: (path) => this.filesHandler.isNoteEx(path),
        isPathIgnored: (path) => this.settings.isPathIgnored(path),
        shouldDeleteConflictingAttachments: this.settings.shouldDeleteExistingFilesWhenMovingNote,
        shouldHandleDeletions: this.settings.shouldDeleteAttachmentsWithNote,
        shouldHandleRenames: this.settings.shouldUpdateLinks,
        shouldRenameAttachmentFolder: this.settings.shouldMoveAttachmentsWithNote,
        shouldUpdateFileNameAliases: this.settings.shouldChangeNoteBacklinksDisplayText
      };
      return settings;
    });

    new CollectAttachmentsInFileCommand(this).register();
    new CollectAttachmentsInCurrentFolderCommand(this).register();
    new CollectAttachmentsEntireVaultCommand(this).register();
    new MoveAttachmentToProperFolderCommand(this).register();
    new DeleteEmptyFoldersCommand(this).register();
    new ConvertAllLinkPathsToRelativeCommand(this).register();
    new ConvertAllLinkPathsToRelativeCurrentNoteCommand(this).register();
    new ConvertAllEmbedsPathsToRelativeCommand(this).register();
    new ConvertAllEmbedsPathsToRelativeCurrentNoteCommand(this).register();
    new ReplaceAllWikilinksWithMarkdownLinksCommand(this).register();
    new ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommand(this).register();
    new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommand(this).register();
    new ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommand(this).register();
    new ReorganizeVaultCommand(this).register();
    new CheckConsistencyCommand(this).register();

    this.linksHandler = new LinksHandler(this);

    this.filesHandler = new FilesHandler(this, this.linksHandler);
  }

  private handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void {
    if (!this.settings.shouldDeleteAttachmentsWithNote || this.settings.isPathIgnored(file.path) || !isMarkdownFile(this.app, file)) {
      return;
    }

    this.deletedNoteCache.set(file.path, prevCache);
  }

  private async handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    if (!this.settings.shouldCollectAttachmentsAutomatically) {
      return;
    }

    const suggestionContainer = activeDocument.querySelector<HTMLDivElement>('.suggestion-container');
    if (suggestionContainer?.isShown()) {
      return;
    }

    collectAttachmentsInAbstractFiles(this, [file]);
  }

  private async saveAllOpenNotes(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView) {
        await leaf.view.save();
      }
    }
  }

  private async showBackupWarning(): Promise<void> {
    if (!this.settings.shouldShowBackupWarning) {
      return;
    }

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
          if (this.settings.hadDangerousSettingsReverted) {
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

    await this.settingsManager.editAndSave((settings) => {
      settings.shouldShowBackupWarning = false;
    });
  }
}
