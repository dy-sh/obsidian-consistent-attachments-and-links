import type { App } from 'obsidian';
import type { PromiseResolve } from 'obsidian-dev-utils/async';

import {
  Modal,
  Setting
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { createFragmentAsync } from 'obsidian-dev-utils/html-element';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { renderInternalLink } from 'obsidian-dev-utils/obsidian/markdown';

import { MoveAttachmentToProperFolderUsedByMultipleNotesMode } from '../plugin-settings.ts';

interface MoveAttachmentToProperFolderUsedByMultipleNotesModalConstructorParams {
  readonly app: App;
  readonly attachmentPath: string;
  readonly backlinks: string[];
  readonly isCancelMode: boolean;
  readonly resolve: PromiseResolve<MoveAttachmentToProperFolderUsedByMultipleNotesModalResult>;
}

interface MoveAttachmentToProperFolderUsedByMultipleNotesModalResult {
  readonly backlinksToCopy: string[];
  readonly mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode;
  readonly shouldUseSameActionForOtherProblematicAttachments: boolean;
}

interface SelectModeParams {
  readonly app: App;
  readonly attachmentPath: string;
  readonly backlinks: string[];
  readonly isCancelMode?: boolean;
}

class MoveAttachmentToProperFolderUsedByMultipleNotesModal extends Modal {
  private readonly attachmentPath: string;
  private readonly backlinks: string[];
  private readonly isCancelMode: boolean;
  private isSelected = false;
  private readonly resolve: PromiseResolve<MoveAttachmentToProperFolderUsedByMultipleNotesModalResult>;
  private readonly selectedBacklinks = new Set<string>();

  public constructor(params: MoveAttachmentToProperFolderUsedByMultipleNotesModalConstructorParams) {
    super(params.app);
    this.attachmentPath = params.attachmentPath;
    this.backlinks = params.backlinks;
    this.resolve = params.resolve;
    this.isCancelMode = params.isCancelMode;
  }

  public override onClose(): void {
    if (!this.isSelected) {
      this.select(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel, false);
    }
  }

  public override onOpen(): void {
    super.onOpen();
    invokeAsyncSafely(() => this.onOpenAsync());
  }

  private async onOpenAsync(): Promise<void> {
    new Setting(this.contentEl)
      .setName(t(($) => $.moveAttachmentToProperFolderUsedByMultipleNotesModal.heading))
      .setHeading();

    this.contentEl.appendChild(
      await createFragmentAsync(async (f) => {
        f.appendText(t(($) => $.moveAttachmentToProperFolderUsedByMultipleNotesModal.content.part1));
        f.appendText(' ');
        f.appendChild(await renderInternalLink({ app: this.app, pathOrAbstractFile: this.attachmentPath }));
        f.appendText(' ');
        f.appendText(t(($) => $.moveAttachmentToProperFolderUsedByMultipleNotesModal.content.part2));
        f.createEl('br');
        f.appendText(t(($) => $.moveAttachmentToProperFolderUsedByMultipleNotesModal.content.part3));
        f.createEl('br');
        for (const backlink of this.backlinks) {
          this.selectedBacklinks.add(backlink);
          f.createEl('br');
          f.createEl('input', { attr: { checked: true }, type: 'checkbox' });
          f.appendChild(await renderInternalLink({ app: this.app, pathOrAbstractFile: backlink }));
        }
        f.createEl('br');
        f.createEl('br');
      })
    );

    let shouldUseSameActionForOtherProblematicAttachments = false;

    if (!this.isCancelMode) {
      new Setting(this.contentEl)
        .setName(t(($) => $.moveAttachmentToProperFolderUsedByMultipleNotesModal.shouldUseSameActionForOtherProblematicAttachmentsToggle))
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
            this.select(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Skip, shouldUseSameActionForOtherProblematicAttachments);
          });
        })
        .addButton((button) => {
          button.setButtonText(t(($) => $.buttons.copyAll));
          button.onClick(() => {
            this.select(MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll, shouldUseSameActionForOtherProblematicAttachments);
          });
        })
        .addButton((button) => {
          button.setButtonText(t(($) => $.buttons.select));
          button.onClick(() => {
            this.select(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt, shouldUseSameActionForOtherProblematicAttachments);
          });
        });
    }

    buttonsSetting
      .addButton((button) => {
        button.setButtonText(t(($) => $.obsidianDevUtils.buttons.cancel));
        button.onClick(() => {
          this.select(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel, shouldUseSameActionForOtherProblematicAttachments);
        });
      });
  }

  private select(mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode, shouldUseSameActionForOtherProblematicAttachments: boolean): void {
    this.isSelected = true;
    this.resolve({
      backlinksToCopy: Array.from(this.selectedBacklinks).sort((a, b) => a.localeCompare(b)),
      mode,
      shouldUseSameActionForOtherProblematicAttachments
    });
    this.close();
  }
}

export function selectMode(params: SelectModeParams): Promise<MoveAttachmentToProperFolderUsedByMultipleNotesModalResult> {
  const { app, attachmentPath, backlinks, isCancelMode } = params;
  return new Promise((resolve) => {
    const modal = new MoveAttachmentToProperFolderUsedByMultipleNotesModal({
      app,
      attachmentPath,
      backlinks,
      isCancelMode: isCancelMode ?? false,
      resolve
    });
    modal.open();
  });
}
