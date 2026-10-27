import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { App } from 'obsidian';

import { LayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { getOrCreateFile } from '@mnaoumov/obsidian-lib/file-system';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import { alert } from '@mnaoumov/obsidian-lib/modals/alert';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from '@mnaoumov/obsidian-lib/vault';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { dirname } from '@mnaoumov/typescript-lib/path';
import {
  MarkdownView,
  setIcon
} from 'obsidian';

import type { MisplacedAttachmentHandler } from '../misplaced-attachments/misplaced-attachment-handler.ts';
import type { PathCompatibilityHandler } from '../path-compatibility/path-compatibility-handler.ts';
import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';

import { MisplacedAttachmentCheckResult } from '../misplaced-attachments/misplaced-attachment-handler.ts';
import { PathCompatibilityCheckResult } from '../path-compatibility/path-compatibility-handler.ts';
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';

interface ConsistentAttachmentsAndLinksComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly linksHandler: LinksHandler;
  readonly misplacedAttachmentHandler: MisplacedAttachmentHandler;
  readonly pathCompatibilityHandler: PathCompatibilityHandler;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class ConsistentAttachmentsAndLinksComponent extends LayoutReadyComponent {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly linksHandler: LinksHandler;
  private readonly misplacedAttachmentHandler: MisplacedAttachmentHandler;
  private readonly pathCompatibilityHandler: PathCompatibilityHandler;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: ConsistentAttachmentsAndLinksComponentConstructorParams) {
    super(params.app);
    this.abortSignalComponent = params.abortSignalComponent;
    this.linksHandler = params.linksHandler;
    this.misplacedAttachmentHandler = params.misplacedAttachmentHandler;
    this.pathCompatibilityHandler = params.pathCompatibilityHandler;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async checkConsistency(): Promise<void> {
    await this.saveAllOpenNotes();

    const badLinks = new ConsistencyCheckResult('Bad links');
    const badEmbeds = new ConsistencyCheckResult('Bad embeds');
    const badFrontmatterLinks = new ConsistencyCheckResult('Bad frontmatter links');
    // Filled by the same walk as the three buckets above: it judges references, and only the ones that
    // resolved, so `LinksHandler` is the one place that has both the reference and its target.
    const misplacedAttachments = new MisplacedAttachmentCheckResult(this.pluginSettingsComponent.settings.externalAttachmentLinkMode);
    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Checking note ${iterationString} - ${item.path}`,
      items: getMarkdownFilesSorted(this.app),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (note) => {
        await this.linksHandler.checkConsistency({
          badEmbeds,
          badFrontmatterLinks,
          badLinks,
          misplacedAttachmentHandler: this.misplacedAttachmentHandler,
          misplacedAttachments,
          note
        });
      },
      progressBarTitle: 'Checking vault consistency...',
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });

    const notePath = this.pluginSettingsComponent.settings.consistencyReportFile;

    // Walks files and folders rather than notes, and reads no file content, so it is its own pass rather
    // than a fourth result filled by the loop above.
    const pathCompatibility = new PathCompatibilityCheckResult();
    this.pathCompatibilityHandler.check(pathCompatibility);

    const text = [badLinks, badEmbeds, badFrontmatterLinks, pathCompatibility, misplacedAttachments]
      .map((result) => result.toString(this.app, notePath))
      .join('');
    await createFolderSafe(this.app, dirname(notePath));
    const note = await getOrCreateFile(this.app, notePath);
    await this.app.vault.modify(note, text);

    let isFileOpened = false;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getDisplayText() !== '' && notePath.startsWith(leaf.getDisplayText())) {
        isFileOpened = true;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Can change in await calls.
    if (!isFileOpened) {
      await this.app.workspace.openLinkText(notePath, '/', false);
    }
  }

  public async fixIncompatiblePaths(): Promise<void> {
    await this.pathCompatibilityHandler.fix();
  }

  protected override onLayoutReady(): void {
    invokeAsyncSafely(() => this.showBackupWarning());
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

    await alert({
      app: this.app,
      message: createFragment((f) => {
        f.createDiv({ cls: 'community-modal-readme' }, (wrapper) => {
          wrapper.appendText('The \'Fix incompatible paths\' command of ');
          appendCodeBlock(wrapper, 'Consistent Attachments and Links');
          wrapper.appendText(' renames files and folders across your whole vault.');
          wrapper.createEl('br');
          wrapper.appendText('It is ');
          wrapper.createEl('strong', { text: 'STRONGLY' });
          wrapper.appendText(' recommended to backup your vault before running it.');
          wrapper.createEl('br');
          wrapper.createEl('a', { href: 'https://github.com/dy-sh/obsidian-consistent-attachments-and-links?tab=readme-ov-file', text: 'Read more' });
          wrapper.appendText(' about how to use the plugin.');
          wrapper.createEl('br');
          wrapper.appendText('This warning will not appear again.');
        });
      }),
      title: createFragment((f) => {
        setIcon(f.createSpan(), 'triangle-alert');
        f.appendText(' ');
        appendCodeBlock(f, 'Consistent Attachments and Links');
      })
    });

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.shouldShowBackupWarning = false;
    });
  }
}
