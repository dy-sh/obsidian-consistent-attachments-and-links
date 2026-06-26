import type {
  App,
  TAbstractFile,
  TFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Vault } from 'obsidian';
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

import type { AttachmentCollector } from '../attachment-collector.ts';
import type { PluginSettingsComponent } from '../plugin-settings-component.ts';

import { selectMode } from '../modals/move-attachment-to-proper-folder-used-by-multiple-notes-modal.ts';
import { MoveAttachmentToProperFolderUsedByMultipleNotesMode } from '../plugin-settings.ts';

interface MoveAttachmentToProperFolderCommandHandlerConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly attachmentCollector: AttachmentCollector;
  readonly pluginName: string;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface MoveAttachmentToProperFolderContext {
  mode?: MoveAttachmentToProperFolderUsedByMultipleNotesMode;
}

export class MoveAttachmentToProperFolderCommandHandler extends AbstractFileCommandHandler {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly attachmentCollector: AttachmentCollector;
  private readonly pluginName2: string;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: MoveAttachmentToProperFolderCommandHandlerConstructorParams) {
    super({
      icon: 'move',
      id: 'move-attachment-to-proper-folder',
      name: 'Move attachment to proper folder'
    });

    this.app = params.app;
    this.attachmentCollector = params.attachmentCollector;
    this.abortSignalComponent = params.abortSignalComponent;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.pluginName2 = params.pluginName;
  }

  protected override canExecuteAbstractFile(abstractFile: TAbstractFile): boolean {
    return !isFile(abstractFile) || !this.attachmentCollector.isNoteEx(abstractFile);
  }

  protected override canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean {
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && this.attachmentCollector.isNoteEx(abstractFile)) {
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
      if (isFile(abstractFile) && !this.attachmentCollector.isNoteEx(abstractFile)) {
        attachmentFilesSet.add(abstractFile);
      }

      if (isFolder(abstractFile)) {
        Vault.recurseChildren(abstractFile, (child) => {
          if (isFile(child) && !this.attachmentCollector.isNoteEx(child)) {
            attachmentFilesSet.add(child);
          }
        });
      }
    }

    const attachmentFiles = Array.from(attachmentFilesSet);
    attachmentFiles.sort((a, b) => a.path.localeCompare(b.path));

    const abortController = new AbortController();
    const combinedAbortSignal = abortSignalAny(abortController.signal, this.abortSignalComponent.abortSignal);
    const ctx: MoveAttachmentToProperFolderContext = {};

    await loop({
      abortSignal: combinedAbortSignal,
      buildNoticeMessage: (attachmentFile, iterationStr) => t(($) => $.moveAttachmentToProperFolder.progressBar.message, { attachmentFilePath: attachmentFile.path, iterationStr }),
      items: attachmentFiles,
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (attachmentFile) => {
        combinedAbortSignal.throwIfAborted();
        if (this.pluginSettingsComponent.settings.isPathIgnored(attachmentFile.path)) {
          console.warn(`Cannot move attachment to proper folder as attachment path is ignored: ${attachmentFile.path}.`);
          return;
        }
        if (!await this.moveAttachmentToProperFolder(attachmentFile, ctx, combinedAbortSignal)) {
          return;
        }
        combinedAbortSignal.throwIfAborted();
      },
      progressBarTitle: `${this.pluginName2}: ${t(($) => $.moveAttachmentToProperFolder.progressBar.title)}`,
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
    let backlinks = await getBacklinksForFileSafe({ app: this.app, pathOrFile: attachmentFile });
    if (backlinks.keys().length === 0) {
      this.pluginNoticeComponent.showNotice(t(($) => $.moveAttachmentToProperFolder.unusedAttachment, { attachmentPath: attachmentFile.path }));
      return true;
    }

    let backlinksToCopy: string[] = [];
    const app = this.app;
    const pluginSettingsComponent = this.pluginSettingsComponent;

    if (
      backlinks.keys().length > 1
      && !await handleMode(ctx.mode ?? this.pluginSettingsComponent.settings.moveAttachmentToProperFolderUsedByMultipleNotesMode)
    ) {
      return false;
    }

    for (const backlink of backlinksToCopy) {
      const backlinkFile = this.app.vault.getFileByPath(backlink);
      if (!backlinkFile) {
        continue;
      }

      const references = backlinks.get(backlink);
      const link = references?.[0];
      if (!link) {
        continue;
      }

      const newAttachmentPath = await this.attachmentCollector.getProperAttachmentPath({
        attachmentFile,
        noteFilePath: backlink
      });
      if (!newAttachmentPath) {
        console.warn(`Skipping moving attachment ${attachmentFile.path} to proper folder as it is already in the destination folder.`);
        continue;
      }

      const linkJsons = new Set(references.map((reference) => toJson(reference)));

      await copySafe({ app: this.app, newPath: newAttachmentPath, oldPathOrFile: attachmentFile });
      await editLinks({
        app: this.app,
        linkConverter: (link2) => {
          const linkJson = toJson(link2);
          if (!linkJsons.has(linkJson)) {
            return;
          }

          return updateLink({
            app: this.app,
            link: link2,
            newSourcePathOrFile: backlinkFile,
            newTargetPathOrFile: newAttachmentPath,
            oldTargetPathOrFile: attachmentFile
          });
        },
        pathOrFile: backlinkFile
      });
    }

    // eslint-disable-next-line require-atomic-updates -- Don't have a better way to do this.
    backlinks = await getBacklinksForFileSafe({ app: this.app, pathOrFile: attachmentFile });

    if (backlinks.keys().length === 0) {
      await deleteIfNotUsed({ app: this.app, pathOrFile: attachmentFile });
    }

    return true;

    async function handleMode(mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode): Promise<boolean> {
      switch (mode) {
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel:
          if (
            pluginSettingsComponent.settings.moveAttachmentToProperFolderUsedByMultipleNotesMode
              === MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel
          ) {
            await selectMode(app, attachmentFile.path, Array.from(backlinks.keys()), true);
          }
          return false;
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll:
          backlinksToCopy = Array.from(backlinks.keys());
          return true;
        case MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt: {
          const { backlinksToCopy: backlinksToCopy2, mode: mode2, shouldUseSameActionForOtherProblematicAttachments } = await selectMode(
            app,
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
