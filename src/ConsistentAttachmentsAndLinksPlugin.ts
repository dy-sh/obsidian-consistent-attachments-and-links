import type { CachedMetadata } from 'obsidian';
import {
  MarkdownView,
  Notice,
  PluginSettingTab,
  TFile
} from 'obsidian';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from 'obsidian-dev-utils/Async';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { registerRenameDeleteHandlers } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from 'obsidian-dev-utils/obsidian/Vault';
import { dirname } from 'obsidian-dev-utils/Path';

import ConsistentAttachmentsAndLinksPluginSettings from './ConsistentAttachmentsAndLinksPluginSettings.ts';
import { ConsistentAttachmentsAndLinksPluginSettingsTab } from './ConsistentAttachmentsAndLinksPluginSettingsTab.ts';
import { FilesHandler } from './files-handler.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';

export default class ConsistentAttachmentsAndLinksPlugin extends PluginBase<ConsistentAttachmentsAndLinksPluginSettings> {
  private lh!: LinksHandler;
  private fh!: FilesHandler;
  private isHandlingMetadataCacheChanged = false;

  protected override createDefaultPluginSettings(): ConsistentAttachmentsAndLinksPluginSettings {
    return new ConsistentAttachmentsAndLinksPluginSettings();
  }

  protected override createPluginSettingsTab(): PluginSettingTab | null {
    return new ConsistentAttachmentsAndLinksPluginSettingsTab(this);
  }

  protected override onloadComplete(): void {
    if (this.settings.showWarning) {
      const notice = new Notice(createFragment((f) => {
        f.appendText('Starting from ');
        appendCodeBlock(f, 'v3.0.0');
        f.appendText(', the plugin ');
        appendCodeBlock(f, 'Consistent Attachments and Links');
        f.appendText(' has setting ');
        appendCodeBlock(f, 'Attachment Subfolder');
        f.appendText(' removed. This is a BREAKING CHANGE.');
        f.appendChild(createEl('br'));
        f.appendChild(createEl('a', { text: 'Read more', href: 'https://github.com/dy-sh/obsidian-consistent-attachments-and-links?tab=readme-ov-file#attachment-subfolder-setting' }));
      }), 0);
      notice.noticeEl.onClickEvent(convertAsyncToSync(async (ev) => {
        if (ev.target instanceof HTMLAnchorElement) {
          ev.preventDefault();
          window.open(ev.target.href, '_blank');
        } else {
          this.settings.showWarning = false;
          await this.saveSettings(this.settings);
        }
      }));
    }

    this.registerEvent(
      this.app.metadataCache.on('deleted', (file, prevCache) => {
        if (prevCache) {
          this.handleDeletedMetadata(file, prevCache);
        }
      })
    );

    registerRenameDeleteHandlers(this, () => ({
      shouldDeleteEmptyFolders: this.settings.deleteEmptyFolders
    }));

    this.addCommand({
      id: 'collect-all-attachments',
      name: 'Collect All Attachments',
      callback: () => this.collectAllAttachments()
    });

    this.addCommand({
      id: 'collect-attachments-current-note',
      name: 'Collect Attachments in Current Note',
      checkCallback: this.collectAttachmentsCurrentNote.bind(this)
    });

    this.addCommand({
      id: 'delete-empty-folders',
      name: 'Delete Empty Folders',
      callback: () => this.deleteEmptyFolders()
    });

    this.addCommand({
      id: 'convert-all-link-paths-to-relative',
      name: 'Convert All Link Paths to Relative',
      callback: () => this.convertAllLinkPathsToRelative()
    });

    this.addCommand({
      id: 'convert-all-link-paths-to-relative-current-note',
      name: 'Convert All Link Paths to Relative in Current Note',
      checkCallback: this.convertAllLinkPathsToRelativeCurrentNote.bind(this)
    });

    this.addCommand({
      id: 'convert-all-embed-paths-to-relative',
      name: 'Convert All Embed Paths to Relative',
      callback: () => this.convertAllEmbedsPathsToRelative()
    });

    this.addCommand({
      id: 'convert-all-embed-paths-to-relative-current-note',
      name: 'Convert All Embed Paths to Relative in Current Note',
      checkCallback: this.convertAllEmbedsPathsToRelativeCurrentNote.bind(this)
    });

    this.addCommand({
      id: 'replace-all-wikilinks-with-markdown-links',
      name: 'Replace All Wiki Links with Markdown Links',
      callback: () => this.replaceAllWikilinksWithMarkdownLinks()
    });

    this.addCommand({
      id: 'replace-all-wikilinks-with-markdown-links-current-note',
      name: 'Replace All Wiki Links with Markdown Links in Current Note',
      checkCallback: this.replaceAllWikilinksWithMarkdownLinksCurrentNote.bind(this)
    });

    this.addCommand({
      id: 'replace-all-wiki-embeds-with-markdown-embeds',
      name: 'Replace All Wiki Embeds with Markdown Embeds',
      callback: () => this.replaceAllWikiEmbedsWithMarkdownEmbeds()
    });

    this.addCommand({
      id: 'replace-all-wiki-embeds-with-markdown-embeds-current-note',
      name: 'Replace All Wiki Embeds with Markdown Embeds in Current Note',
      checkCallback: this.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote.bind(this)
    });

    this.addCommand({
      id: 'reorganize-vault',
      name: 'Reorganize Vault',
      callback: () => this.reorganizeVault()
    });

    this.addCommand({
      id: 'check-consistency',
      name: 'Check Vault consistency',
      callback: () => this.checkConsistency()
    });

    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      invokeAsyncSafely(this.handleMetadataCacheChanged(file));
    }));

    this.lh = new LinksHandler(
      this.app,
      'Consistent Attachments and Links: ',
      this.settings.ignoreFolders,
      this.settings.getIgnoreFilesRegex()
    );

    this.fh = new FilesHandler(
      this.app,
      this.lh,
      'Consistent Attachments and Links: ',
      this.settings.ignoreFolders,
      this.settings.getIgnoreFilesRegex(),
      this.settings.deleteEmptyFolders
    );
  }

  private deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();

  private isPathIgnored(path: string): boolean {
    if (path.startsWith('./')) {
      path = path.substring(2);
    }

    for (const folder of this.settings.ignoreFolders) {
      if (path.startsWith(folder)) {
        return true;
      }
    }

    for (const fileRegex of this.settings.getIgnoreFilesRegex()) {
      if (fileRegex.test(path)) {
        return true;
      }
    }

    return false;
  }

  private handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void {
    if (!this.settings.deleteAttachmentsWithNote || this.isPathIgnored(file.path) || file.extension.toLowerCase() !== 'md') {
      return;
    }

    this.deletedNoteCache.set(file.path, prevCache);
  }

  private collectAttachmentsCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== 'md') {
      return false;
    }

    if (!checking) {
      invokeAsyncSafely(this.collectAttachments(note));
    }

    return true;
  }

  private async collectAttachments(note: TFile, isVerbose = true): Promise<void> {
    if (this.isPathIgnored(note.path)) {
      new Notice('Note path is ignored');
      return;
    }

    await this.saveAllOpenNotes();

    const result = await this.fh.collectAttachmentsForCachedNote(
      note.path,
      this.settings.deleteExistFilesWhenMoveNote,
      this.settings.deleteEmptyFolders);

    if (result.movedAttachments.length > 0) {
      await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
    }

    if (result.movedAttachments.length == 0) {
      if (isVerbose) {
        new Notice('No files found that need to be moved');
      }
    } else {
      new Notice(`Moved ${result.movedAttachments.length.toString()} attachment${result.movedAttachments.length > 1 ? 's' : ''}`);
    }
  }

  private async collectAllAttachments(): Promise<void> {
    let movedAttachmentsCount = 0;
    let processedNotesCount = 0;

    await this.saveAllOpenNotes();

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Collecting attachments # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.fh.collectAttachmentsForCachedNote(
        note.path,
        this.settings.deleteExistFilesWhenMoveNote,
        this.settings.deleteEmptyFolders);

      if (result.movedAttachments.length > 0) {
        await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
        movedAttachmentsCount += result.movedAttachments.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (movedAttachmentsCount == 0) {
      new Notice('No files found that need to be moved');
    } else {
      new Notice(`Moved ${movedAttachmentsCount.toString()} attachment${movedAttachmentsCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${processedNotesCount > 1 ? 's' : ''}`);
    }
  }

  private async convertAllEmbedsPathsToRelative(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedEmbedCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Converting embed paths to relative # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.convertAllNoteEmbedsPathsToRelative(note.path);

      if (result.length > 0) {
        changedEmbedCount += result.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (changedEmbedCount == 0) {
      new Notice('No embeds found that need to be converted');
    } else {
      new Notice(`Converted ${changedEmbedCount.toString()} embed${changedEmbedCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${processedNotesCount > 1 ? 's' : ''}`);
    }
  }

  private async convertAllLinkPathsToRelative(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Converting link paths to relative # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.convertAllNoteLinksPathsToRelative(note.path);

      if (result.length > 0) {
        changedLinksCount += result.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (changedLinksCount == 0) {
      new Notice('No links found that need to be converted');
    } else {
      new Notice(`Converted ${changedLinksCount.toString()} link${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${processedNotesCount > 1 ? 's' : ''}`);
    }
  }

  private async replaceAllWikilinksWithMarkdownLinks(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Replacing wikilinks with markdown links # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false);
      changedLinksCount += result;
      processedNotesCount++;
    }

    notice.hide();

    if (changedLinksCount == 0) {
      new Notice('No wiki links found that need to be replaced');
    } else {
      new Notice(`Replaced ${changedLinksCount.toString()} wikilink${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${processedNotesCount > 1 ? 's' : ''}`);
    }
  }

  private async replaceAllWikiEmbedsWithMarkdownEmbeds(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Replacing wiki embeds with markdown embeds # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true);
      changedLinksCount += result;
      processedNotesCount++;
    }

    notice.hide();

    if (changedLinksCount == 0) {
      new Notice('No wiki embeds found that need to be replaced');
    } else {
      new Notice(`Replaced ${changedLinksCount.toString()} wiki embed${changedLinksCount > 1 ? 's' : ''} from ${processedNotesCount.toString()} note${processedNotesCount > 1 ? 's' : ''}`);
    }
  }

  private async deleteEmptyFolders(): Promise<void> {
    await this.fh.deleteEmptyFolders('/');
  }

  private async checkConsistency(): Promise<void> {
    await this.saveAllOpenNotes();

    const badLinks = new ConsistencyCheckResult('Bad links');
    const badEmbeds = new ConsistencyCheckResult('Bad embeds');
    const wikiLinks = new ConsistencyCheckResult('Wiki links');
    const wikiEmbeds = new ConsistencyCheckResult('Wiki embeds');

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice('', 0);
    for (const note of notes) {
      if (this.abortSignal.aborted) {
        notice.hide();
        return;
      }
      i++;
      const message = `Checking note # ${i.toString()} / ${notes.length.toString()} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      await this.lh.checkConsistency(note, badLinks, badEmbeds, wikiLinks, wikiEmbeds);
    }

    notice.hide();

    const notePath = this.settings.consistencyReportFile;
    const text
      = badLinks.toString(this.app, notePath)
      + badEmbeds.toString(this.app, notePath)
      + wikiLinks.toString(this.app, notePath)
      + wikiEmbeds.toString(this.app, notePath);
    await createFolderSafe(this.app, dirname(notePath));
    const note = this.app.vault.getFileByPath(notePath) ?? await this.app.vault.create(notePath, '');
    await this.app.vault.modify(note, text);

    let fileOpened = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getDisplayText() != '' && notePath.startsWith(leaf.getDisplayText())) {
        fileOpened = true;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!fileOpened) {
      await this.app.workspace.openLinkText(notePath, '/', false);
    }
  }

  private async reorganizeVault(): Promise<void> {
    await this.saveAllOpenNotes();

    await this.replaceAllWikilinksWithMarkdownLinks();
    await this.replaceAllWikiEmbedsWithMarkdownEmbeds();
    await this.convertAllEmbedsPathsToRelative();
    await this.convertAllLinkPathsToRelative();
    // - Rename all attachments (using Unique attachments, optional)
    await this.collectAllAttachments();
    await this.deleteEmptyFolders();
    new Notice('Reorganization of the vault completed');
  }

  public override async saveSettings(newSettings: ConsistentAttachmentsAndLinksPluginSettings): Promise<void> {
    await super.saveSettings(newSettings);

    this.lh = new LinksHandler(
      this.app,
      'Consistent Attachments and Links: ',
      this.settings.ignoreFolders,
      this.settings.getIgnoreFilesRegex()
    );

    this.fh = new FilesHandler(
      this.app,
      this.lh,
      'Consistent Attachments and Links: ',
      this.settings.ignoreFolders,
      this.settings.getIgnoreFilesRegex()
    );
  }

  private async saveAllOpenNotes(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view as MarkdownView;
      await view.save();
    }
  }

  private convertAllLinkPathsToRelativeCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== 'md') {
      return false;
    }

    if (!checking) {
      invokeAsyncSafely(this.lh.convertAllNoteLinksPathsToRelative(note.path));
    }

    return true;
  }

  private convertAllEmbedsPathsToRelativeCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== 'md') {
      return false;
    }

    if (!checking) {
      invokeAsyncSafely(this.lh.convertAllNoteEmbedsPathsToRelative(note.path));
    }

    return true;
  }

  private replaceAllWikilinksWithMarkdownLinksCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== 'md') {
      return false;
    }

    if (!checking) {
      invokeAsyncSafely(this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false));
    }

    return true;
  }

  private replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== 'md') {
      return false;
    }

    if (!checking) {
      invokeAsyncSafely(this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true));
    }

    return true;
  }

  private async handleMetadataCacheChanged(file: TFile): Promise<void> {
    if (!this.settings.autoCollectAttachments) {
      return;
    }

    const suggestionContainer = document.querySelector<HTMLDivElement>('.suggestion-container');
    if (suggestionContainer && suggestionContainer.style.display !== 'none') {
      return;
    }

    if (this.isHandlingMetadataCacheChanged) {
      return;
    }

    this.isHandlingMetadataCacheChanged = true;
    try {
      await this.collectAttachments(file, false);
    } finally {
      this.isHandlingMetadataCacheChanged = false;
    }
  }
}

function appendCodeBlock(fragment: DocumentFragment, text: string): void {
  fragment.appendChild(createSpan({ cls: 'markdown-rendered code' }, (span) => {
    span.style.fontWeight = 'bold';
    span.appendChild(createEl('code', { text }));
  }));
}
