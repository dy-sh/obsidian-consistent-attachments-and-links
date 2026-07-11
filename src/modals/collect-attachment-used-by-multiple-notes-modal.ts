import type { App } from 'obsidian';
import type { PromiseResolve } from 'obsidian-dev-utils/async';

import {
  Modal,
  Setting
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import {
  createElAsync,
  createFragmentAsync
} from 'obsidian-dev-utils/html-element';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { renderInternalLink } from 'obsidian-dev-utils/obsidian/markdown';

import { CollectAttachmentUsedByMultipleNotesMode } from '../plugin-settings.ts';

interface CollectAttachmentUsedByMultipleNotesModalConstructorParams {
  readonly app: App;
  readonly attachmentPath: string;
  readonly backlinks: string[];
  readonly isCancelMode: boolean;
  readonly resolve: PromiseResolve<CollectAttachmentUsedByMultipleNotesModalResult>;
}

interface CollectAttachmentUsedByMultipleNotesModalResult {
  readonly mode: CollectAttachmentUsedByMultipleNotesMode;
  readonly shouldUseSameActionForOtherProblematicAttachments: boolean;
}

interface SelectModeParams {
  readonly app: App;
  readonly attachmentPath: string;
  readonly backlinks: string[];
  readonly isCancelMode?: boolean;
}

class CollectAttachmentUsedByMultipleNotesModal extends Modal {
  private readonly attachmentPath: string;
  private readonly backlinks: string[];
  private readonly isCancelMode: boolean;
  private isSelected = false;
  private readonly resolve: PromiseResolve<CollectAttachmentUsedByMultipleNotesModalResult>;

  public constructor(params: CollectAttachmentUsedByMultipleNotesModalConstructorParams) {
    super(params.app);
    this.attachmentPath = params.attachmentPath;
    this.backlinks = params.backlinks;
    this.resolve = params.resolve;
    this.isCancelMode = params.isCancelMode;
  }

  public override onClose(): void {
    if (!this.isSelected) {
      this.select(CollectAttachmentUsedByMultipleNotesMode.Cancel, false);
    }
  }

  public override onOpen(): void {
    super.onOpen();
    invokeAsyncSafely(() => this.onOpenAsync());
  }

  private async onOpenAsync(): Promise<void> {
    super.onOpen();
    new Setting(this.contentEl)
      .setName(t(($) => $.collectAttachmentUsedByMultipleNotesModal.heading))
      .setHeading();

    this.contentEl.appendChild(
      await createFragmentAsync(async (f) => {
        f.appendText(t(($) => $.collectAttachmentUsedByMultipleNotesModal.content.part1));
        f.appendText(' ');
        f.appendChild(await renderInternalLink({ app: this.app, pathOrAbstractFile: this.attachmentPath }));
        f.appendText(' ');
        f.appendText(t(($) => $.collectAttachmentUsedByMultipleNotesModal.content.part2));
        f.appendChild(
          await createElAsync('ul', {}, async (ul) => {
            for (const backlink of this.backlinks) {
              ul.appendChild(
                await createElAsync('li', {}, async (li) => {
                  li.appendChild(await renderInternalLink({ app: this.app, pathOrAbstractFile: backlink }));
                })
              );
            }
          })
        );
      })
    );

    let shouldUseSameActionForOtherProblematicAttachments = false;

    if (!this.isCancelMode) {
      new Setting(this.contentEl)
        .setName(t(($) => $.collectAttachmentUsedByMultipleNotesModal.shouldUseSameActionForOtherProblematicAttachmentsToggle))
        .addToggle((toggle) => {
          toggle.setValue(false);
          toggle.onChange((value) => {
            shouldUseSameActionForOtherProblematicAttachments = value;
          });
        });
    }

    const buttonsSetting = new Setting(this.contentEl);
    if (!this.isCancelMode) {
      buttonsSetting
        .addButton((button) => {
          button.setButtonText(t(($) => $.buttons.skip));
          button.onClick(() => {
            this.select(CollectAttachmentUsedByMultipleNotesMode.Skip, shouldUseSameActionForOtherProblematicAttachments);
          });
        })
        .addButton((button) => {
          button.setButtonText(t(($) => $.buttons.move));
          button.onClick(() => {
            this.select(CollectAttachmentUsedByMultipleNotesMode.Move, shouldUseSameActionForOtherProblematicAttachments);
          });
        })
        .addButton((button) => {
          button.setButtonText(t(($) => $.buttons.copy));
          button.onClick(() => {
            this.select(CollectAttachmentUsedByMultipleNotesMode.Copy, shouldUseSameActionForOtherProblematicAttachments);
          });
        });
    }

    buttonsSetting
      .addButton((button) => {
        button.setButtonText(t(($) => $.obsidianDevUtils.buttons.cancel));
        button.onClick(() => {
          this.select(CollectAttachmentUsedByMultipleNotesMode.Cancel, shouldUseSameActionForOtherProblematicAttachments);
        });
      });
  }

  private select(mode: CollectAttachmentUsedByMultipleNotesMode, shouldUseSameActionForOtherProblematicAttachments: boolean): void {
    this.isSelected = true;
    this.resolve({ mode, shouldUseSameActionForOtherProblematicAttachments });
    this.close();
  }
}

export function selectMode(params: SelectModeParams): Promise<CollectAttachmentUsedByMultipleNotesModalResult> {
  const { app, attachmentPath, backlinks, isCancelMode } = params;
  return new Promise((resolve) => {
    const modal = new CollectAttachmentUsedByMultipleNotesModal({ app, attachmentPath, backlinks, isCancelMode: isCancelMode ?? false, resolve });
    modal.open();
  });
}
