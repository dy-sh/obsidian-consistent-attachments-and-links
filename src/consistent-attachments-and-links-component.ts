import type {
  App,
  CachedMetadata
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

import {
  MarkdownView,
  Notice,
  setIcon,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { omitAsyncReturnType } from 'obsidian-dev-utils/function';
import { LayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import {
  getOrCreateFile,
  isMarkdownFile
} from 'obsidian-dev-utils/obsidian/file-system';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import { addToQueue } from 'obsidian-dev-utils/obsidian/queue';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from 'obsidian-dev-utils/obsidian/vault';
import { dirname } from 'obsidian-dev-utils/path';

import type { AttachmentCollector } from './attachment-collector.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { FilesHandler } from './files-handler.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';

interface ConsistentAttachmentsAndLinksComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly attachmentCollector: AttachmentCollector;
  readonly filesHandler: FilesHandler;
  readonly linksHandler: LinksHandler;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class ConsistentAttachmentsAndLinksComponent extends LayoutReadyComponent {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly attachmentCollector: AttachmentCollector;
  private readonly deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();
  private readonly filesHandler: FilesHandler;
  private readonly linksHandler: LinksHandler;

  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: ConsistentAttachmentsAndLinksComponentConstructorParams) {
    super(params.app);

    this.filesHandler = params.filesHandler;
    this.linksHandler = params.linksHandler;
    this.abortSignalComponent = params.abortSignalComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.attachmentCollector = params.attachmentCollector;
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
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Converting embed paths to relative ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.convertAllNoteEmbedsPathsToRelative(note.path, this.abortSignalComponent.abortSignal);

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
        `Converted ${String(changedEmbedCount)} embed${changedEmbedCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${processedNotesCount > 1 ? 's' : ''}`
      );
    }
  }

  public convertAllEmbedsPathsToRelativeCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
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
        `Converted ${String(changedLinksCount)} link${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${processedNotesCount > 1 ? 's' : ''}`
      );
    }
  }

  public convertAllLinkPathsToRelativeCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
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
    await this.convertAllLinkPathsToRelative(this.abortSignalComponent.abortSignal);
    this.attachmentCollector.collectAttachmentsEntireVault();
    await this.deleteEmptyFolders();
    new Notice('Reorganization of the vault completed');
  }

  public async replaceAllWikiEmbedsWithMarkdownEmbeds(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Replacing wiki embeds with markdown embeds ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, true, this.abortSignalComponent.abortSignal);
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
        `Replaced ${String(changedLinksCount)} wiki embed${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${processedNotesCount > 1 ? 's' : ''}`
      );
    }
  }

  public replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
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
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Replacing wikilinks with markdown links ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        if (this.pluginSettingsComponent.settings.isPathIgnored(note.path)) {
          return;
        }

        const result = await this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, this.abortSignalComponent.abortSignal);
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
        `Replaced ${String(changedLinksCount)} wikilink${changedLinksCount > 1 ? 's' : ''} from ${String(processedNotesCount)} note${processedNotesCount > 1 ? 's' : ''}`
      );
    }
  }

  public replaceAllWikilinksWithMarkdownLinksCurrentNote(note: TFile): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
      app: this.app,
      operationFn: omitAsyncReturnType((abortSignal) => this.linksHandler.replaceAllNoteWikilinksWithMarkdownLinks(note.path, false, abortSignal)),
      operationName: 'Replace all wiki embeds with markdown embeds in current note'
    });
  }

  protected override onLayoutReady(): void {
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
        abortSignal: this.abortSignalComponent.abortSignal,
        app: this.app,
        operationFn: (abortSignal) => {
          this.handleMetadataCacheChanged(file, abortSignal);
        },
        operationName: 'handleMetadataCacheChanged'
      });
    }));
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

    this.attachmentCollector.collectAttachmentsInAbstractFiles([file]);
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
