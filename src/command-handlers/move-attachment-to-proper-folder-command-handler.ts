import type {
  TAbstractFile,
  TFile
} from 'obsidian';

import {
  Notice,
  Vault
} from 'obsidian';
import { abortSignalAny } from 'obsidian-dev-utils/abort-controller';
import { toJson } from 'obsidian-dev-utils/object-utils';
import { AbstractFileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/abstract-file-command-handler';
import {
  isFile,
  isFolder
} from 'obsidian-dev-utils/obsidian/file-system';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import {
  editLinks,
  updateLink
} from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { getBacklinksForFileSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { copySafe } from 'obsidian-dev-utils/obsidian/vault';
import { deleteIfNotUsed } from 'obsidian-dev-utils/obsidian/vault-delete';

import type { Plugin } from '../plugin.ts';

import {
  getProperAttachmentPath,
  isNoteEx
} from '../attachment-collector.ts';
import { selectMode } from '../modals/move-attachment-to-proper-folder-used-by-multiple-notes-modal.ts';
import { MoveAttachmentToProperFolderUsedByMultipleNotesMode } from '../plugin-settings.ts';

interface MoveAttachmentToProperFolderContext {
  mode?: MoveAttachmentToProperFolderUsedByMultipleNotesMode;
}

export class MoveAttachmentToProperFolderCommandHandler extends AbstractFileCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'move',
      id: 'move-attachment-to-proper-folder',
      name: 'Move attachment to proper folder'
    });
  }

  protected override canExecuteAbstractFile(abstractFile: TAbstractFile): boolean {
    return !isFile(abstractFile) || !isNoteEx(this.plugin, abstractFile);
  }

  protected override canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean {
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && isNoteEx(this.plugin, abstractFile)) {
        return false;
      }
    }
    return true;
  }

  protected override async executeAbstractFile(abstractFile: TAbstractFile): Promise<void> {
    await this.executeAbstractFiles([abstractFile]);
  }

  protected override async executeAbstractFiles(abstractFiles: TAbstractFile[]): Promise<void> {
    const attachmentFilesSet = new Set<TFile>();

    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && !isNoteEx(this.plugin, abstractFile)) {
        attachmentFilesSet.add(abstractFile);
      }

      if (isFolder(abstractFile)) {
        Vault.recurseChildren(abstractFile, (child) => {
          if (isFile(child) && !isNoteEx(this.plugin, child)) {
            attachmentFilesSet.add(child);
          }
        });
      }
    }

    const attachmentFiles = Array.from(attachmentFilesSet);
    attachmentFiles.sort((a, b) => a.path.localeCompare(b.path));

    const abortController = new AbortController();
    const combinedAbortSignal = abortSignalAny(abortController.signal, this.plugin.abortSignal);
    const ctx: MoveAttachmentToProperFolderContext = {};

    await loop({
      abortSignal: combinedAbortSignal,
      buildNoticeMessage: (attachmentFile, iterationStr) => t(($) => $.moveAttachmentToProperFolder.progressBar.message, { attachmentFilePath: attachmentFile.path, iterationStr }),
      items: attachmentFiles,
      processItem: async (attachmentFile) => {
        combinedAbortSignal.throwIfAborted();
        if (this.plugin.pluginSettingsComponent.settings.isPathIgnored(attachmentFile.path)) {
          console.warn(`Cannot move attachment to proper folder as attachment path is ignored: ${attachmentFile.path}.`);
          return;
        }
        if (!await this.moveAttachmentToProperFolder(attachmentFile, ctx, combinedAbortSignal)) {
          return;
        }
        combinedAbortSignal.throwIfAborted();
      },
      progressBarTitle: `${this.plugin.manifest.name}: ${t(($) => $.moveAttachmentToProperFolder.progressBar.title)}`,
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });
  }

  protected override shouldAddToAbstractFileMenu(): boolean {
    return true;
  }

  protected override shouldAddToAbstractFilesMenu(): boolean {
    return true;
  }

  private async moveAttachmentToProperFolder(
    attachmentFile: TFile,
    ctx: MoveAttachmentToProperFolderContext,
    combinedAbortSignal: AbortSignal
  ): Promise<boolean> {
    let backlinks = await getBacklinksForFileSafe(this.plugin.app, attachmentFile);
    if (backlinks.keys().length === 0) {
      new Notice(t(($) => $.moveAttachmentToProperFolder.unusedAttachment, { attachmentPath: attachmentFile.path }));
      return true;
    }

    let backlinksToCopy: string[] = [];
    const that = this;

    if (
      backlinks.keys().length > 1
      && !await handleMode(ctx.mode ?? this.plugin.pluginSettingsComponent.settings.moveAttachmentToProperFolderUsedByMultipleNotesMode)
    ) {
      return false;
    }

    for (const backlink of backlinksToCopy) {
      const backlinkFile = this.plugin.app.vault.getFileByPath(backlink);
      if (!backlinkFile) {
        continue;
      }

      const references = backlinks.get(backlink);
      const link = references?.[0];
      if (!link) {
        continue;
      }

      const newAttachmentPath = await getProperAttachmentPath({
        attachmentFile,
        noteFilePath: backlink,
        plugin: this.plugin,
        reference: link
      });
      if (!newAttachmentPath) {
        console.warn(`Skipping moving attachment ${attachmentFile.path} to proper folder as it is already in the destination folder.`);
        continue;
      }

      const linkJsons = new Set(references.map((reference) => toJson(reference)));

      await copySafe(this.plugin.app, attachmentFile, newAttachmentPath);
      await editLinks(this.plugin.app, backlinkFile, (link2) => {
        const linkJson = toJson(link2);
        if (!linkJsons.has(linkJson)) {
          return;
        }

        return updateLink({
          app: this.plugin.app,
          link: link2,
          newSourcePathOrFile: backlinkFile,
          newTargetPathOrFile: newAttachmentPath,
          oldTargetPathOrFile: attachmentFile
        });
      });
    }

    // eslint-disable-next-line require-atomic-updates -- Don't have a better way to do this.
    backlinks = await getBacklinksForFileSafe(this.plugin.app, attachmentFile);

    if (backlinks.keys().length === 0) {
      await deleteIfNotUsed(this.plugin.app, attachmentFile);
    }

    return true;

    async function handleMode(mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode): Promise<boolean> {
      switch (mode) {
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel:
          if (
            that.plugin.pluginSettingsComponent.settings.moveAttachmentToProperFolderUsedByMultipleNotesMode
              === MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel
          ) {
            await selectMode(that.plugin.app, attachmentFile.path, Array.from(backlinks.keys()), true);
          }
          return false;
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll:
          backlinksToCopy = Array.from(backlinks.keys());
          return true;
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt: {
          const { backlinksToCopy: backlinksToCopy2, mode: mode2, shouldUseSameActionForOtherProblematicAttachments } = await selectMode(
            that.plugin.app,
            attachmentFile.path,
            Array.from(backlinks.keys())
          );
          if (shouldUseSameActionForOtherProblematicAttachments) {
            ctx.mode = mode2;
          }

          if (mode2 === MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt) {
            backlinksToCopy = backlinksToCopy2;
            return true;
          }

          return handleMode(mode2);
        }
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.Skip:
          backlinksToCopy = [];
          return true;
        default:
          combinedAbortSignal.throwIfAborted();
          return false;
      }
    }
  }
}
