import type {
  Reference,
  ReferenceCache,
  TAbstractFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PathOrAbstractFile } from 'obsidian-dev-utils/obsidian/file-system';
import type { ResourceLockComponent } from 'obsidian-dev-utils/obsidian/resource-lock';
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
import {
  AttachmentPathContext,
  getAttachmentFilePath,
  isAtProperAttachmentPath
} from 'obsidian-dev-utils/obsidian/attachment-path';
import {
  findAttachmentUnitFolderPath,
  rebasePathOntoFolder
} from 'obsidian-dev-utils/obsidian/attachment-unit-folder';
import {
  getPath,
  isCanvasFile,
  isFile,
  isFolder,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import {
  editLinks,
  extractLinkFile,
  updateLink
} from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getBacklinksForFileSafe,
  getCacheSafe,
  getLinks
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { addToQueue } from 'obsidian-dev-utils/obsidian/queue';
import {
  copySafe,
  renameSafe
} from 'obsidian-dev-utils/obsidian/vault';
import {
  basename,
  dirname,
  join
} from 'obsidian-dev-utils/path';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { selectMode } from './modals/collect-attachment-used-by-multiple-notes-modal.ts';
import { CollectAttachmentUsedByMultipleNotesMode } from './plugin-settings.ts';

interface AttachmentCollectorCollectAttachmentsParams {
  readonly abortSignal: AbortSignal;
  readonly context: CollectAttachmentContext;
  readonly note: TFile;
}

interface AttachmentCollectorConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly pluginName: string;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly resourceLockComponent: null | ResourceLockComponent;
}

interface AttachmentCollectorGetProperAttachmentPathParams {
  readonly attachmentFile: TFile;
  readonly noteFilePath: string;
}

interface AttachmentCollectorPrepareAttachmentToMoveParams {
  readonly movedUnitFolderPaths: ReadonlyMap<string, string>;
  readonly newNotePath: string;
  readonly oldAttachmentPaths: Set<string>;
  readonly oldNotePath: string;
  readonly reference: Reference;
}

interface AttachmentMoveResult {
  readonly newAttachmentPath: null | string;
  readonly oldAttachmentPath: string;
  /**
   * Set when the attachment sits inside a folder the user designated as a single unit, in which case
   * the whole folder travels and this attachment simply comes along inside it.
   */
  readonly unitFolderPath: null | string;
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
  private readonly resourceLockComponent: null | ResourceLockComponent;

  public constructor(params: AttachmentCollectorConstructorParams) {
    this.abortSignalComponent = params.abortSignalComponent;
    this.app = params.app;
    this.resourceLockComponent = params.resourceLockComponent;
    this.pluginName = params.pluginName;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public collectAttachmentsEntireVault(): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
      operationFunction: (abortSignal) => this.collectAttachmentsInAbstractFilesImpl([this.app.vault.getRoot()], abortSignal),
      operationName: t(($) => $.commands.collectAttachmentsEntireVault)
    });
  }

  public collectAttachmentsInAbstractFiles(abstractFiles: TAbstractFile[]): void {
    addToQueue({
      abortSignal: this.abortSignalComponent.abortSignal,
      operationFunction: (abortSignal) => this.collectAttachmentsInAbstractFilesImpl(abstractFiles, abortSignal),
      operationName: t(($) => $.menuItems.collectAttachmentsInFile)
    });
  }

  public async getProperAttachmentPath(params: AttachmentCollectorGetProperAttachmentPathParams): Promise<null | string> {
    // When the attachment already sits at its proper path — the proper base name OR the proper base name
    // Plus an Obsidian deduplication suffix (` 1`, ` 2`, ...) parked there because a different file occupies
    // The deduplication-free slot — there is nothing to move. Returning `null` here makes auto-collect
    // Converge: without it, `getAttachmentFilePath({ shouldSkipDuplicateCheck: true })` yields the
    // Deduplication-free target, which permanently disagrees with the deduplication-parked destination, so
    // The note change fired by the preceding move re-triggers auto-collect and renames it forever (issue #152).
    if (
      await isAtProperAttachmentPath({
        app: this.app,
        attachmentPathOrFile: params.attachmentFile,
        context: AttachmentPathContext.Unknown,
        notePathOrFile: params.noteFilePath
      })
    ) {
      return null;
    }

    return await getAttachmentFilePath({
      app: this.app,
      context: AttachmentPathContext.Unknown,
      notePathOrFile: params.noteFilePath,
      oldAttachmentPathOrFile: params.attachmentFile,
      shouldSkipDuplicateCheck: true
    });
  }

  public isNoteEx(pathOrFile: null | PathOrAbstractFile): boolean {
    if (!pathOrFile || !isNote(pathOrFile)) {
      return false;
    }

    const path = getPath(this.app, pathOrFile);
    return !this.pluginSettingsComponent.settings.isTreatedAsAttachment(path);
  }

  private async collectAttachments(params: AttachmentCollectorCollectAttachmentsParams): Promise<void> {
    params.abortSignal.throwIfAborted();
    const app = this.app;
    const resourceLockComponent = this.resourceLockComponent;
    const pluginSettingsComponent = this.pluginSettingsComponent;
    const pluginNoticeComponent = this.pluginNoticeComponent;

    if (params.context.isAborted) {
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
      if (params.context.isAborted) {
        return;
      }

      if (!cache) {
        return;
      }

      const links = isCanvas ? await getCanvasLinks(this.app, params.note) : getLinks({ cache });
      params.abortSignal.throwIfAborted();

      // Attachment unit folders already carried away during this note's collection: old path -> new path.
      // One folder holds many attachments, so the remaining links into it are already satisfied.
      const movedUnitFolderPaths = new Map<string, string>();

      for (const link of links) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Could be changed in await call.
        if (params.context.isAborted) {
          return;
        }

        let attachmentMoveResult = await this.prepareAttachmentToMove({
          movedUnitFolderPaths,
          newNotePath: params.note.path,
          oldAttachmentPaths,
          oldNotePath: params.note.path,
          reference: link
        });
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
          const backlinksString = backlinksSorted.map((backlink) => `- ${backlink}`).join('\n');

          async function shouldCollectWithMode(
            collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode
          ): Promise<boolean> {
            params.abortSignal.throwIfAborted();
            let definedAttachmentMoveResult = ensureNonNullable(attachmentMoveResult);

            switch (collectAttachmentUsedByMultipleNotesMode) {
              case CollectAttachmentUsedByMultipleNotesMode.Cancel: {
                console.error(
                  `Cancelling collecting attachments, as attachment ${definedAttachmentMoveResult.oldAttachmentPath} is referenced by multiple notes.\n${backlinksString}`
                );
                if (pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode === CollectAttachmentUsedByMultipleNotesMode.Cancel) {
                  await selectMode({ app, attachmentPath: definedAttachmentMoveResult.oldAttachmentPath, backlinks: backlinksSorted, isCancelMode: true });
                }
                // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
                params.context.isAborted = true;
                return false;
              }
              case CollectAttachmentUsedByMultipleNotesMode.Copy: {
                if (!definedAttachmentMoveResult.newAttachmentPath) {
                  console.warn(`Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                  return false;
                }
                if (definedAttachmentMoveResult.unitFolderPath) {
                  // Copying the lone file out of a unit folder produces exactly the broken attachment
                  // The unit designation exists to prevent, and copying the whole tree behind the
                  // Other notes' backs is worse. Leave it where every note can still reach it.
                  console.warn(
                    `Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it belongs to the attachment unit folder`
                      + ` ${definedAttachmentMoveResult.unitFolderPath} and is referenced by multiple notes.\n${backlinksString}`
                  );
                  pluginNoticeComponent.showNotice(t(($) => $.notice.attachmentUnitFolderUsedByMultipleNotes, {
                    attachmentPath: definedAttachmentMoveResult.oldAttachmentPath,
                    unitFolderPath: definedAttachmentMoveResult.unitFolderPath
                  }));
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
                  pathOrFile: params.note,
                  pluginNoticeComponent,
                  resourceLockComponent
                });
                break;
              }
              case CollectAttachmentUsedByMultipleNotesMode.Move: {
                if (!definedAttachmentMoveResult.newAttachmentPath) {
                  console.warn(`Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                  return false;
                }
                await registerMoveAttachment();
                params.abortSignal.throwIfAborted();
                break;
              }
              case CollectAttachmentUsedByMultipleNotesMode.Prompt: {
                const { mode, shouldUseSameActionForOtherProblematicAttachments } = await selectMode({
                  app,
                  attachmentPath: definedAttachmentMoveResult.oldAttachmentPath,
                  backlinks: backlinksSorted
                });
                if (shouldUseSameActionForOtherProblematicAttachments) {
                  // eslint-disable-next-line require-atomic-updates -- Cannot avoid.
                  params.context.collectAttachmentUsedByMultipleNotesMode = mode;
                }
                // eslint-disable-next-line unicorn/no-useless-recursion -- A single re-dispatch after the user picks a mode in the modal; a loop would obscure the switch.
                return shouldCollectWithMode(mode);
              }
              case CollectAttachmentUsedByMultipleNotesMode.Skip: {
                console.warn(
                  `Skipping collecting attachment ${definedAttachmentMoveResult.oldAttachmentPath} as it is referenced by multiple notes.\n${backlinksString}`
                );
                return false;
              }
              default: {
                throw new Error(
                  `Unknown collect attachment used by multiple notes mode: ${pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode}`
                );
              }
            }

            return true;
          }

          if (
            !await shouldCollectWithMode(
              params.context.collectAttachmentUsedByMultipleNotesMode ?? pluginSettingsComponent.settings.collectAttachmentUsedByMultipleNotesMode
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

          const newAttachmentPath = attachmentMoveResult.unitFolderPath
            ? await moveUnitFolder(attachmentMoveResult.unitFolderPath, attachmentMoveResult.oldAttachmentPath, attachmentMoveResult.newAttachmentPath)
            : await renameSafe({ app, newPath: attachmentMoveResult.newAttachmentPath, oldPathOrAbstractFile: attachmentMoveResult.oldAttachmentPath });

          if (!newAttachmentPath) {
            return;
          }

          attachmentMoveResult = {
            ...attachmentMoveResult,
            newAttachmentPath
          };
        }

        /**
         * Moves the whole designated folder and reports where the linked attachment ended up inside
         * it. The folder lands in the note's attachment folder — the same folder the lone file would
         * have gone to — under its own name, so the tree's internal shape and the relative links
         * inside it are untouched.
         */
        async function moveUnitFolder(unitFolderPath: string, oldAttachmentPath: string, plannedAttachmentPath: string): Promise<null | string> {
          const unitFolder = app.vault.getFolderByPath(unitFolderPath);
          if (!unitFolder) {
            console.warn(`Skipping collecting attachment ${oldAttachmentPath} as its attachment unit folder ${unitFolderPath} could not be resolved.`);
            return null;
          }

          const newUnitFolderPath = await renameSafe({
            app,
            newPath: join(dirname(plannedAttachmentPath), basename(unitFolderPath)),
            oldPathOrAbstractFile: unitFolder
          });
          movedUnitFolderPaths.set(unitFolderPath, newUnitFolderPath);

          // The whole tree moved, so the attachment is wherever it was inside it, only rebased.
          return rebasePathOntoFolder({
            newFolderPath: newUnitFolderPath,
            oldFolderPath: unitFolderPath,
            path: oldAttachmentPath
          });
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

    // `isNoteEx`, not the plain extension-based `isNote`: a file listed in `treatAsAttachmentExtensions`
    // Is Markdown on disk but is really an attachment, and scanning one as a source note rewrites the
    // References stored inside it — which is exactly what issue #151 forbids, because that is where
    // Excalidraw keeps its embedded-image links. This is the single choke point for every collect entry
    // Point (vault, folder, file, auto-collect), so filtering here covers all of them.
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && this.isNoteEx(abstractFile)) {
        noteFilesSet.add(abstractFile);
      }

      if (isFolder(abstractFile)) {
        Vault.recurseChildren(abstractFile, (child) => {
          if (isFile(child) && this.isNoteEx(child)) {
            noteFilesSet.add(child);
          }
        });
      }
    }

    const noteFiles = [...noteFilesSet];
    noteFiles.sort((a, b) => a.path.localeCompare(b.path));

    const context: CollectAttachmentContext = {};
    const abortController = new AbortController();

    const combinedAbortSignal = abortSignalAny(abortController.signal, this.abortSignalComponent.abortSignal);

    await loop({
      abortSignal: combinedAbortSignal,
      buildNoticeMessage: ({ item, iterationString }) => t(($) => $.attachmentCollector.progressBar.message, { iterationString, noteFilePath: item.path }),
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
          context,
          note: noteFile
        });
        combinedAbortSignal.throwIfAborted();
        if (context.isAborted) {
          abortController.abort();
        }
      },
      progressBarTitle: `${this.pluginName}: ${t(($) => $.attachmentCollector.progressBar.title)}`,
      shouldContinueOnError: true,
      shouldShowProgressBar: true
    });
  }

  private async prepareAttachmentToMove(params: AttachmentCollectorPrepareAttachmentToMoveParams): Promise<AttachmentMoveResult | null> {
    const { newNotePath, oldAttachmentPaths, oldNotePath, reference } = params;
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

    // An earlier link in this same note may have already carried this attachment away inside its unit
    // Folder. The link snapshot still names the old path, so without this the file reads as
    // Unresolvable and would be reported as a broken link rather than as work already done.
    for (const movedUnitFolderPath of params.movedUnitFolderPaths.keys()) {
      if (oldAttachmentFile.path.startsWith(`${movedUnitFolderPath}/`)) {
        return null;
      }
    }

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
      oldAttachmentPath: oldAttachmentFile.path,
      unitFolderPath: findAttachmentUnitFolderPath({
        attachmentPath: oldAttachmentFile.path,
        checkIsAttachmentUnitFolder: (folderPath) => this.pluginSettingsComponent.settings.isAttachmentUnitFolder(folderPath)
      })
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
