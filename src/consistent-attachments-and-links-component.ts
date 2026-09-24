import type { App } from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import {
  MarkdownView,
  setIcon
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { LayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import { getOrCreateFile } from 'obsidian-dev-utils/obsidian/file-system';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import {
  createFolderSafe,
  getMarkdownFilesSorted
} from 'obsidian-dev-utils/obsidian/vault';
import { dirname } from 'obsidian-dev-utils/path';

import type { MisplacedAttachmentHandler } from './misplaced-attachment-handler.ts';
import type { PathCompatibilityHandler } from './path-compatibility-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';
import { MisplacedAttachmentCheckResult } from './misplaced-attachment-handler.ts';
import { PathCompatibilityCheckResult } from './path-compatibility-handler.ts';

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
    const misplacedAttachments = new MisplacedAttachmentCheckResult();
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
      progressBarTitle: 'Consistent Attachments and Links: Checking vault consistency...',
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

  public async reorganizeVault(): Promise<void> {
    await this.saveAllOpenNotes();

    // Collecting attachments, the step that used to come first, left with the rest of collecting for Custom
    // Attachment Location in 5.0.0.
    await this.fixIncompatiblePaths();
    this.pluginNoticeComponent.showNotice('Reorganization of the vault completed');
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
          wrapper.appendText(
            'The \'Fix incompatible paths\' and \'Reorganize vault\' commands of \'Consistent Attachments and Links\' rename files and folders across your whole vault.'
          );
          wrapper.createEl('br');
          wrapper.appendText('It is ');
          wrapper.createEl('strong', { text: 'STRONGLY' });
          wrapper.appendText(' recommended to backup your vault before running them.');
          wrapper.createEl('br');
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
