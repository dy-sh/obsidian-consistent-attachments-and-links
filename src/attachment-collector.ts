import type {
  Reference,
  ReferenceCache,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PathOrAbstractFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { MaybeReturn } from 'obsidian-dev-utils/type';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import {
  App,
  Notice,
  setIcon,
  TFile,
  Vault
} from 'obsidian';
import { abortSignalAny } from 'obsidian-dev-utils/abort-controller';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { appendCodeBlock } from 'obsidian-dev-utils/html-element';
import {
  AttachmentPathContext,
  getAttachmentFilePath
} from 'obsidian-dev-utils/obsidian/attachment-path';
import {
  getPath,
  isCanvasFile,
  isFile,
  isFolder,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import {
  editLinks,
  extractLinkFile,
  updateLink
} from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getAllLinks,
  getBacklinksForFileSafe,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { addToQueue } from 'obsidian-dev-utils/obsidian/queue';
import {
  copySafe,
  renameSafe
} from 'obsidian-dev-utils/obsidian/vault';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { selectMode } from './modals/collect-attachment-used-by-multiple-notes-modal.ts';
import { CollectAttachmentUsedByMultipleNotesMode } from './plugin-settings.ts';

interface AttachmentCollectorCollectAttachmentsParams {
  readonly abortSignal: AbortSignal;
  readonly ctx: CollectAttachmentContext;
  readonly note: TFile;
}

interface AttachmentCollectorConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly pluginName: string;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface AttachmentCollectorGetProperAttachmentPathParams {
  readonly attachmentFile: TFile;
  readonly noteFilePath: string;
}

interface AttachmentMoveResult {
  readonly newAttachmentPath: null | string;
  readonly oldAttachmentPath: string;
}

interface CollectAttachmentContext {
  collectAttachmentUsedByMultipleNotesMode?: CollectAttachmentUsedByMultipleNotesMode;
  isAborted?: boolean;
}

export class AttachmentCollector {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly app: App;
  private readonly pluginName: string;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: AttachmentCollectorConstructorParams) {
    this.abortSignalComponent = params.abortSignalComponent;
    this.app = params.app;
    this.pluginName = params.pluginName;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public collectAttachmentsEntireVault(): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
      operationFn: (abortSignal) => this.collectAttachmentsInAbstractFilesImpl([this.app.vault.getRoot()], abortSignal),
      operationName: t(($) => $.commands.collectAttachmentsEntireVault)
    });
  }

  public collectAttachmentsInAbstractFiles(abstractFiles: TAbstractFile[]): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
      operationFn: (abortSignal) => this.collectAttachmentsInAbstractFilesImpl(abstractFiles, abortSignal),
      operationName: t(($) => $.menuItems.collectAttachmentsInFile)
    });
  }

  public async getProperAttachmentPath(params: AttachmentCollectorGetProperAttachmentPathParams): Promise<null | string> {
    const newAttachmentPath = await getAttachmentFilePath({
      app: this.app,
      context: AttachmentPathContext.Unknown,
      notePathOrFile: params.noteFilePath,
      oldAttachmentPathOrFile: params.attachmentFile,
      shouldSkipDuplicateCheck: true
    });

    if (params.attachmentFile.path === newAttachmentPath) {
      return null;
    }

    return newAttachmentPath;
  }

  public isNoteEx(pathOrFile: null | PathOrAbstractFile): boolean {
    if (!pathOrFile || !isNote(pathOrFile)) {
      return false;
    }

    const path = getPath(this.app, pathOrFile);
    return this.pluginSettingsComponent.settings.treatAsAttachmentExtensions.every((extension) => !path.endsWith(extension));
  }

  private async collectAttachments(params: AttachmentCollectorCollectAttachmentsParams): Promise<void> {
    params.abortSignal.throwIfAborted();
    const app = this.app;
    const pluginSettingsComponent = this.pluginSettingsComponent;
    const pluginNoticeComponent = this.pluginNoticeComponent;

    if (params.ctx.isAborted) {
      return;
    }

    let notice = null as Notice | null;
    const DELAY_BEFORE_SHOWING_NOTICE_IN_MILLISECONDS = 500;
    let isDone = false;
    invokeAsyncSafely(showNotice);

    try {
      const isCanvas = isCanvasFile(params.note);

      const oldAttachmentPaths = new Set<string>();

      const cache = await getCacheSafe(this.app, params.note);
      params.abortSignal.throwIfAborted();

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Could be changed in await call.
      if (params.ctx.isAborted) {
        return;
      }

      if (!cache) {
        return;
      }

      const links = isCanvas ? await getCanvasLinks(this.app, params.note) : getAllLinks(cache);
      params.abortSignal.throwIfAborted();

      for (const link of links) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Could be changed in await call.
        if (params.ctx.isAborted) {
          return;
        }

        let attachmentMoveResult = await this.prepareAttachmentToMove(link, params.note.path, params.note.path, oldAttachmentPaths);
        params.abortSignal.throwIfAborted();
        if (!attachmentMoveResult) {
          continue;
        }

        if (this.pluginSettingsComponent.settings.isExcludedFromAttachmentCollecting(attachmentMoveResult.oldAttachmentPath)) {
          console.warn(`Skipping collecting attachment ${attachmentMoveResult.oldAttachmentPath} as it is excluded from attachment collecting.`);
          continue;
        }

        const backlinks = await getBacklinksForFileSafe({ app: this.app, pathOrFile: attachmentMoveResult.oldAttachmentPath });
        params.abortSignal.throwIfAborted();
        if (backlinks.keys().length > 1) {
          const backlinksSorted = backlinks.keys().sort((a, b) => a.localeCompare(b));
          const backlinksStr = backlinksSorted.map((backlink) => `- ${backlink}`).join('\n');

          async function applyCollectAttachmentUsedByMultipleNotesMode(
            collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode
          ): Promise<boolean> {
            params.abortSignal.throwIfAborted();
            let definedAttachmentMoveResult = ensureNonNullable(attachmentMoveResult);

            switch (collectAttachmentUsedByMultipleNotesMode) {
              case CollectAttachmentUsedByMultipleNotesMode.Cancel:
                console.error(
                  `Cancelling collecting attachments, as attachment ${definedAttachmentMoveResult.oldAttachmentPath} is referenced by multiple notes.\n${backlinksStr}`
                );
                if (pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode === CollectAttachmentUsedByMultipleNotesMode.Cancel) {
                  await selectMode(app, definedAttachmentMoveResult.oldAttachmentPath, backlinksSorted, true);
                }
                // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
                params.ctx.isAborted = true;
                return false;
              case CollectAttachmentUsedByMultipleNotesMode.Copy:
                if (!definedAttachmentMoveResult.newAttachmentPath) {
                  console.warn(`Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                  return false;
                }
                // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
                definedAttachmentMoveResult = {
                  ...definedAttachmentMoveResult,
                  newAttachmentPath: await copySafe({
                    app,
                    newPath: definedAttachmentMoveResult.newAttachmentPath,
                    oldPathOrFile: definedAttachmentMoveResult.oldAttachmentPath
                  })
                };
                await editLinks({
                  app,
                  linkConverter: (link2): MaybeReturn<string> => {
                    const linkFile = extractLinkFile({ app, link: link2, sourcePathOrFile: params.note });
                    if (linkFile?.path !== definedAttachmentMoveResult.oldAttachmentPath) {
                      return;
                    }
                    return updateLink({
                      app,
                      link: link2,
                      newSourcePathOrFile: params.note,
                      newTargetPathOrFile: ensureNonNullable(definedAttachmentMoveResult.newAttachmentPath),
                      oldSourcePathOrFile: params.note,
                      oldTargetPathOrFile: definedAttachmentMoveResult.oldAttachmentPath
                    });
                  },
                  pathOrFile: params.note
                });
                break;
              case CollectAttachmentUsedByMultipleNotesMode.Move:
                if (!definedAttachmentMoveResult.newAttachmentPath) {
                  console.warn(`Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                  return false;
                }
                await registerMoveAttachment();
                params.abortSignal.throwIfAborted();
                break;
              case CollectAttachmentUsedByMultipleNotesMode.Prompt: {
                const { mode, shouldUseSameActionForOtherProblematicAttachments } = await selectMode(
                  app,
                  definedAttachmentMoveResult.oldAttachmentPath,
                  backlinksSorted
                );
                if (shouldUseSameActionForOtherProblematicAttachments) {
                  // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
                  params.ctx.collectAttachmentUsedByMultipleNotesMode = mode;
                }
                return applyCollectAttachmentUsedByMultipleNotesMode(mode);
              }
              case CollectAttachmentUsedByMultipleNotesMode.Skip:
                console.warn(
                  `Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is referenced by multiple notes.\n${backlinksStr}`
                );
                return false;
              default:
                throw new Error(
                  `Unknown collect attachment used by multiple notes mode: ${pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode}`
                );
            }

            return true;
          }

          if (
            !await applyCollectAttachmentUsedByMultipleNotesMode(
              params.ctx.collectAttachmentUsedByMultipleNotesMode ?? pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode
            )
          ) {
            params.abortSignal.throwIfAborted();
            continue;
          }
        } else {
          params.abortSignal.throwIfAborted();
          await registerMoveAttachment();
          params.abortSignal.throwIfAborted();
        }

        async function registerMoveAttachment(): Promise<void> {
          params.abortSignal.throwIfAborted();
          if (!attachmentMoveResult?.newAttachmentPath) {
            return;
          }

          // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
          attachmentMoveResult = {
            ...attachmentMoveResult,
            newAttachmentPath: await renameSafe({ app, newPath: attachmentMoveResult.newAttachmentPath, oldPathOrAbstractFile: attachmentMoveResult.oldAttachmentPath })
          };
        }
      }
    } finally {
      notice?.hide();
      isDone = true;
    }

    async function showNotice(): Promise<void> {
      await sleep(DELAY_BEFORE_SHOWING_NOTICE_IN_MILLISECONDS);
      if (isDone) {
        return;
      }
      notice = pluginNoticeComponent.showNotice(t(($) => $.notice.collectingAttachments, { noteFilePath: params.note.path }), {
        isPermanent: true
      });
    }
  }

  private async collectAttachmentsInAbstractFilesImpl(abstractFiles: TAbstractFile[], abortSignal: AbortSignal): Promise<void> {
    abortSignal.throwIfAborted();
    const singleFile: null | TFile = abstractFiles.length === 1 && isFile(abstractFiles[0]) ? abstractFiles[0] : null;

    if (singleFile && this.pluginSettingsComponent.settings.isPathIgnored(singleFile.path)) {
      this.pluginNoticeComponent.showNotice(t(($) => $.notice.notePathIsIgnored));
      console.warn(`Cannot collect attachments in the note as note path is ignored: ${singleFile.path}.`);
      return;
    }

    const canCollectAttachments = !!singleFile || (await confirm({
      app: this.app,
      cancelButtonText: t(($) => $.obsidianDevUtils.buttons.cancel),
      message: createFragment((f) => {
        f.appendText(t(($) => $.attachmentCollector.confirm.part1));
        f.createEl('br');
        f.createEl('ul', {}, (ul) => {
          for (const abstractFile of abstractFiles) {
            ul.createEl('li', {}, (li) => {
              appendCodeBlock(li, abstractFile.path);
            });
          }
        });
        f.createEl('br');
        f.appendText(t(($) => $.attachmentCollector.confirm.part2));
      }),
      okButtonText: t(($) => $.obsidianDevUtils.buttons.ok),
      title: createFragment((f) => {
        setIcon(f.createSpan(), 'lucide-alert-triangle');
        f.appendText(' ');
        f.appendText(t(($) => $.menuItems.collectAttachmentsInFiles));
      })
    }));

    if (!canCollectAttachments) {
      abortSignal.throwIfAborted();
      return;
    }
    const noteFilesSet = new Set<TFile>();

    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && isNote(abstractFile)) {
        noteFilesSet.add(abstractFile);
      }

      if (isFolder(abstractFile)) {
        Vault.recurseChildren(abstractFile, (child) => {
          if (isFile(child) && isNote(child)) {
            noteFilesSet.add(child);
          }
        });
      }
    }

    const noteFiles = Array.from(noteFilesSet);
    noteFiles.sort((a, b) => a.path.localeCompare(b.path));

    const ctx: CollectAttachmentContext = {};
    const abortController = new AbortController();

    const combinedAbortSignal = abortSignalAny(abortController.signal, this.abortSignalComponent.abortSignal);

    await loop({
      abortSignal: combinedAbortSignal,
      buildNoticeMessage: (noteFile, iterationStr) => t(($) => $.attachmentCollector.progressBar.message, { iterationStr, noteFilePath: noteFile.path }),
      items: noteFiles,
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (noteFile) => {
        combinedAbortSignal.throwIfAborted();
        if (this.pluginSettingsComponent.settings.isPathIgnored(noteFile.path)) {
          console.warn(`Cannot collect attachments in the note as note path is ignored: ${noteFile.path}.`);
          return;
        }
        await this.collectAttachments({
          abortSignal: combinedAbortSignal,
          ctx,
          note: noteFile
        });
        combinedAbortSignal.throwIfAborted();
        if (ctx.isAborted) {
          abortController.abort();
        }
      },
      progressBarTitle: `${this.pluginName}: ${t(($) => $.attachmentCollector.progressBar.title)}`,
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });
  }

  private async prepareAttachmentToMove(
    reference: Reference,
    newNotePath: string,
    oldNotePath: string,
    oldAttachmentPaths: Set<string>
  ): Promise<AttachmentMoveResult | null> {
    const oldAttachmentFile = extractLinkFile({ app: this.app, link: reference, shouldAllowNonExistingFile: true, sourcePathOrFile: oldNotePath });

    if (!oldAttachmentFile) {
      return null;
    }

    if (this.isNoteEx(oldAttachmentFile)) {
      return null;
    }

    if (oldAttachmentPaths.has(oldAttachmentFile.path)) {
      return null;
    }

    oldAttachmentPaths.add(oldAttachmentFile.path);

    if (oldAttachmentFile.deleted) {
      console.warn(`Skipping collecting attachment ${reference.link} as it could not be resolved.`);
      return null;
    }

    const newAttachmentPath = await this.getProperAttachmentPath({
      attachmentFile: oldAttachmentFile,
      noteFilePath: newNotePath
    });

    return {
      newAttachmentPath,
      oldAttachmentPath: oldAttachmentFile.path
    };
  }
}

async function getCanvasLinks(app: App, canvasFile: TFile): Promise<ReferenceCache[]> {
  const canvasData = await app.vault.readJson(canvasFile.path) as CanvasData;
  const paths = canvasData.nodes.filter((node) => node.type === 'file').map((node) => node.file);
  return paths.map((path) => ({
    link: path,
    original: path,
    position: {
      end: { col: 0, line: 0, loc: 0, offset: 0 },
      start: { col: 0, line: 0, loc: 0, offset: 0 }
    }
  }));
}
