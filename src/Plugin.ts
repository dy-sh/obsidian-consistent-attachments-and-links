import type {
  CachedMetadata,
  Menu,
  TAbstractFile
} from 'obsidian';
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
  getMarkdownFiles,
  getOrCreateFile,
  isFolder,
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

import { FilesHandler } from './files-handler.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';
import { PluginSettingsManager } from './PluginSettingsManager.ts';
import { PluginSettingsTab } from './PluginSettingsTab.ts';

export class Plugin extends PluginBase<PluginTypes> {
  private deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();

  private fh!: FilesHandler;
  private lh!: LinksHandler;

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
    this.lh = new LinksHandler(this);
    this.fh = new FilesHandler(this, this.lh);
  }

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this);
  }

  protected override createSettingsTab(): null | PluginSettingsTab {
    return new PluginSettingsTab(this);
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
      addToQueue(this.app, (abortSignal) => this.handleMetadataCacheChanged(file, abortSignal), this.abortSignal);
    }));
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    registerRenameDeleteHandlers(this, () => {
      const settings: Partial<RenameDeleteHandlerSettings> = {
        emptyAttachmentFolderBehavior: this.settings.emptyAttachmentFolderBehavior,
        isNote: (path) => this.fh.isNoteEx(path),
        isPathIgnored: (path) => this.settings.isPathIgnored(path),
        shouldDeleteConflictingAttachments: this.settings.shouldDeleteExistingFilesWhenMovingNote,
        shouldHandleDeletions: this.settings.shouldDeleteAttachmentsWithNote,
        shouldHandleRenames: this.settings.shouldUpdateLinks,
        shouldRenameAttachmentFolder: this.settings.shouldMoveAttachmentsWithNote,
        shouldUpdateFileNameAliases: this.settings.shouldChangeNoteBacklinksDisplayText
      };
      return settings;
    });

    this.addCommand({
      callback: () => this.collectAllAttachments(),
      id: 'collect-all-attachments',
      name: 'Collect All Attachments'
    });

    this.addCommand({
      checkCallback: (checking) => this.collectAttachmentsCurrentFolder(checking),
      id: 'collect-attachments-current-folder',
      name: 'Collect Attachments in Current Folder'
    });

    this.addCommand({
      checkCallback: this.collectAttachmentsCurrentNote.bind(this),
      id: 'collect-attachments-current-note',
      name: 'Collect Attachments in Current Note'
    });

    this.addCommand({
      callback: () => this.deleteEmptyFolders(),
      id: 'delete-empty-folders',
      name: 'Delete Empty Folders'
    });

    this.addCommand({
      callback: () => this.convertAllLinkPathsToRelative(this.abortSignal),
      id: 'convert-all-link-paths-to-relative',
      name: 'Convert All Link Paths to Relative'
    });

    this.addCommand({
      checkCallback: this.convertAllLinkPathsToRelativeCurrentNote.bind(this),
      id: 'convert-all-link-paths-to-relative-current-note',
      name: 'Convert All Link Paths to Relative in Current Note'
    });

    this.addCommand({
      callback: () => this.convertAllEmbedsPathsToRelative(),
      id: 'convert-all-embed-paths-to-relative',
      name: 'Convert All Embed Paths to Relative'
    });

    this.addCommand({
      checkCallback: this.convertAllEmbedsPathsToRelativeCurrentNote.bind(this),
      id: 'convert-all-embed-paths-to-relative-current-note',
      name: 'Convert All Embed Paths to Relative in Current Note'
    });

    this.addCommand({
      callback: () => this.replaceAllWikilinksWithMarkdownLinks(),
      id: 'replace-all-wikilinks-with-markdown-links',
      name: 'Replace All Wiki Links with Markdown Links'
    });

    this.addCommand({
      checkCallback: this.replaceAllWikilinksWithMarkdownLinksCurrentNote.bind(this),
      id: 'replace-all-wikilinks-with-markdown-links-current-note',
      name: 'Replace All Wiki Links with Markdown Links in Current Note'
    });

    this.addCommand({
      callback: () => this.replaceAllWikiEmbedsWithMarkdownEmbeds(),
      id: 'replace-all-wiki-embeds-with-markdown-embeds',
      name: 'Replace All Wiki Embeds with Markdown Embeds'
    });

    this.addCommand({
      checkCallback: this.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote.bind(this),
      id: 'replace-all-wiki-embeds-with-markdown-embeds-current-note',
      name: 'Replace All Wiki Embeds with Markdown Embeds in Current Note'
    });

    this.addCommand({
      callback: () => this.reorganizeVault(),
      id: 'reorganize-vault',
      name: 'Reorganize Vault'
    });

    this.addCommand({
      callback: () => this.checkConsistency(),
      id: 'check-consistency',
      name: 'Check Vault consistency'
    });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      this.handleFileMenu(menu, file);
    }));

    this.lh = new LinksHandler(this);

    this.fh = new FilesHandler(this, this.lh);
  }

  private async checkConsistency(): Promise<void> {
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
        await this.lh.checkConsistency(note, badLinks, badEmbeds, wikiLinks, wikiEmbeds, badFrontmatterLinks);
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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fileOpened) {
      await this.app.workspace.openLinkText(notePath, '/', false);
    }
  }

  private async collectAllAttachments(): Promise<void> {
    await this.collectAttachmentsInFolder('/', this.abortSignal);
  }

  private async collectAttachments(note: TFile, abortSignal: AbortSignal, isVerbose = true): Promise<void> {
    abortSignal.throwIfAborted();
    if (this.settings.isPathIgnored(note.path)) {
      if (isVerbose) {
        new Notice('Note path is ignored');
      }
      return;
    }

    await this.saveAllOpenNotes();
    abortSignal.throwIfAborted();

    const result = await this.fh.collectAttachmentsForCachedNote(note.path);
    abortSignal.throwIfAborted();

    if (result.movedAttachments.length > 0) {
      await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
      abortSignal.throwIfAborted();
    }

    if (result.movedAttachments.length === 0) {
      if (isVerbose) {
        new Notice('No files found that need to be moved');
      }
    } else {
      new Notice(`Moved ${result.movedAttachments.length.toString()} attachment${result.movedAttachments.length > 1 ? 's' : ''}`);
    }
  }

  private collectAttachmentsCurrentFolder(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(this.app, (abortSignal) => this.collectAttachmentsInFolder(note.parent?.path ?? '/', abortSignal), this.abortSignal);
    }

    return true;
  }

  private collectAttachmentsCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(this.app, (abortSignal) => this.collectAttachments(note, abortSignal), this.abortSignal);
    }

    return true;
  }

  private async collectAttachmentsInFolder(folderPath: string, abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    let movedAttachmentsCount = 0;
    let processedNotesCount = 0;

    await this.saveAllOpenNotes();

    await loop({
      abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Collecting attachments ${iterationStr} - ${note.path}`,
      items: getMarkdownFiles(this.app, folderPath, true),
      processItem: async (note) => {
        abortSignal.throwIfAborted();
        if (this.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.fh.collectAttachmentsForCachedNote(note.path);
        abortSignal.throwIfAborted();

        if (result.movedAttachments.length > 0) {
          await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
          abortSignal.throwIfAborted();
          movedAttachmentsCount += result.movedAttachments.length;
          processedNotesCount++;
        }
      },
      progressBarTitle: 'Consistent Attachments and Links: Collecting attachments...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    if (movedAttachmentsCount === 0) {
      new Notice('No files found that need to be moved');
    } else {
      new Notice(
        `Moved ${movedAttachmentsCount.toString()} attachment${movedAttachmentsCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  private async convertAllEmbedsPathsToRelative(): Promise<void> {
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

        const result = await this.lh.convertAllNoteEmbedsPathsToRelative(note.path, this.abortSignal);

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
        `Converted ${changedEmbedCount.toString()} embed${changedEmbedCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  private convertAllEmbedsPathsToRelativeCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(this.app, omitAsyncReturnType((abortSignal) => this.lh.convertAllNoteEmbedsPathsToRelative(note.path, abortSignal)), this.abortSignal);
    }

    return true;
  }

  private async convertAllLinkPathsToRelative(abortSignal: AbortSignal): Promise<void> {
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

        const result = await this.lh.convertAllNoteLinksPathsToRelative(note.path, abortSignal);

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
        `Converted ${changedLinksCount.toString()} link${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  private convertAllLinkPathsToRelativeCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(this.app, omitAsyncReturnType((abortSignal) => this.lh.convertAllNoteLinksPathsToRelative(note.path, abortSignal)), this.abortSignal);
    }

    return true;
  }

  private async deleteEmptyFolders(): Promise<void> {
    await this.fh.deleteEmptyFolders('/');
  }

  private handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void {
    if (!this.settings.shouldDeleteAttachmentsWithNote || this.settings.isPathIgnored(file.path) || !isMarkdownFile(this.app, file)) {
      return;
    }

    this.deletedNoteCache.set(file.path, prevCache);
  }

  private handleFileMenu(menu: Menu, file: TAbstractFile): void {
    if (!isFolder(file)) {
      return;
    }

    menu.addItem((item) => {
      item.setTitle('Collect attachments in folder')
        .setIcon('download')
        .onClick(() => this.collectAttachmentsInFolder(file.path, this.abortSignal));
    });
  }

  private async handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    if (!this.settings.shouldCollectAttachmentsAutomatically) {
      return;
    }

    const suggestionContainer = document.querySelector<HTMLDivElement>('.suggestion-container');
    if (suggestionContainer && suggestionContainer.style.display !== 'none') {
      return;
    }

    await this.collectAttachments(file, abortSignal, false);
  }

  private async reorganizeVault(): Promise<void> {
    await this.saveAllOpenNotes();

    await this.replaceAllWikilinksWithMarkdownLinks();
    await this.replaceAllWikiEmbedsWithMarkdownEmbeds();
    await this.convertAllEmbedsPathsToRelative();
    await this.convertAllLinkPathsToRelative(this.abortSignal);
    await this.collectAllAttachments();
    await this.deleteEmptyFolders();
    new Notice('Reorganization of the vault completed');
  }

  private async replaceAllWikiEmbedsWithMarkdownEmbeds(): Promise<void> {
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

        const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true, this.abortSignal);
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
        `Replaced ${changedLinksCount.toString()} wiki embed${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  private replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(
        this.app,
        omitAsyncReturnType((abortSignal) => this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true, abortSignal)),
        this.abortSignal
      );
    }

    return true;
  }

  private async replaceAllWikilinksWithMarkdownLinks(): Promise<void> {
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

        const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, this.abortSignal);
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
        `Replaced ${changedLinksCount.toString()} wikilink${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${
          processedNotesCount > 1 ? 's' : ''
        }`
      );
    }
  }

  private replaceAllWikilinksWithMarkdownLinksCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || !isMarkdownFile(this.app, note)) {
      return false;
    }

    if (!checking) {
      addToQueue(
        this.app,
        omitAsyncReturnType((abortSignal) => this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, abortSignal)),
        this.abortSignal
      );
    }

    return true;
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
