import type {
  Reference,
  ReferenceCache,
  TAbstractFile
} from 'obsidian';
import type { PathOrAbstractFile } from 'obsidian-dev-utils/obsidian/FileSystem';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type { CanvasData } from 'obsidian/canvas.d.ts';

import {
  App,
  Notice,
  setIcon,
  TFile,
  Vault
} from 'obsidian';
import { abortSignalAny } from 'obsidian-dev-utils/AbortController';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { appendCodeBlock } from 'obsidian-dev-utils/HTMLElement';
import {
  AttachmentPathContext,
  getAttachmentFilePath
} from 'obsidian-dev-utils/obsidian/AttachmentPath';
import {
  getPath,
  isCanvasFile,
  isFile,
  isFolder,
  isNote
} from 'obsidian-dev-utils/obsidian/FileSystem';
import { t } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import {
  editLinks,
  extractLinkFile,
  updateLink
} from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import {
  getAllLinks,
  getBacklinksForFileSafe,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import { confirm } from 'obsidian-dev-utils/obsidian/Modals/Confirm';
import { addToQueue } from 'obsidian-dev-utils/obsidian/Queue';
import {
  copySafe,
  renameSafe
} from 'obsidian-dev-utils/obsidian/Vault';

import type { Plugin } from './Plugin.ts';

import { ActionContext } from './ActionContext.ts';
import { selectMode } from './Modals/CollectAttachmentUsedByMultipleNotesModal.ts';
import { CollectAttachmentUsedByMultipleNotesMode } from './PluginSettings.ts';

export interface GetProperAttachmentPathOptions {
  actionContext: ActionContext;
  attachmentFile: TFile;
  noteFilePath: string;
  plugin: Plugin;
  reference: Reference;
}

interface AttachmentMoveResult {
  newAttachmentPath: null | string;
  oldAttachmentPath: string;
}

interface CollectAttachmentContext {
  collectAttachmentUsedByMultipleNotesMode?: CollectAttachmentUsedByMultipleNotesMode;
  isAborted?: boolean;
}

export async function collectAttachments(
  plugin: Plugin,
  note: TFile,
  ctx: CollectAttachmentContext,
  abortSignal: AbortSignal
): Promise<void> {
  abortSignal.throwIfAborted();
  const app = plugin.app;

  if (ctx.isAborted) {
    return;
  }

  let notice = null as Notice | null;
  const DELAY_BEFORE_SHOWING_NOTICE_IN_MILLISECONDS = 500;
  let isDone = false;
  invokeAsyncSafely(showNotice);

  try {
    const isCanvas = isCanvasFile(app, note);

    const oldAttachmentPaths = new Set<string>();

    const cache = await getCacheSafe(app, note);
    abortSignal.throwIfAborted();

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Could be changed in await call.
    if (ctx.isAborted) {
      return;
    }

    if (!cache) {
      return;
    }

    const links = isCanvas ? await getCanvasLinks(app, note) : getAllLinks(cache);
    abortSignal.throwIfAborted();

    for (const link of links) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Could be changed in await call.
      if (ctx.isAborted) {
        return;
      }

      const attachmentMoveResult = await prepareAttachmentToMove(plugin, link, note.path, note.path, oldAttachmentPaths);
      abortSignal.throwIfAborted();
      if (!attachmentMoveResult) {
        continue;
      }

      if (plugin.settings.isExcludedFromAttachmentCollecting(attachmentMoveResult.oldAttachmentPath)) {
        console.warn(`Skipping collecting attachment ${attachmentMoveResult.oldAttachmentPath} as it is excluded from attachment collecting.`);
        continue;
      }

      const backlinks = await getBacklinksForFileSafe(app, attachmentMoveResult.oldAttachmentPath);
      abortSignal.throwIfAborted();
      if (backlinks.keys().length > 1) {
        const backlinksSorted = backlinks.keys().sort((a, b) => a.localeCompare(b));
        const backlinksStr = backlinksSorted.map((backlink) => `- ${backlink}`).join('\n');

        async function applyCollectAttachmentUsedByMultipleNotesMode(
          collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode
        ): Promise<boolean> {
          abortSignal.throwIfAborted();
          if (!attachmentMoveResult) {
            return false;
          }

          switch (collectAttachmentUsedByMultipleNotesMode) {
            case CollectAttachmentUsedByMultipleNotesMode.Cancel:
              console.error(
                `Cancelling collecting attachments, as attachment ${attachmentMoveResult.oldAttachmentPath} is referenced by multiple notes.\n${backlinksStr}`
              );
              if (plugin.settings.collectAttachmentUsedByMultipleNotesMode === CollectAttachmentUsedByMultipleNotesMode.Cancel) {
                await selectMode(app, attachmentMoveResult.oldAttachmentPath, backlinksSorted, true);
              }
              ctx.isAborted = true;
              return false;
            case CollectAttachmentUsedByMultipleNotesMode.Copy:
              if (!attachmentMoveResult.newAttachmentPath) {
                console.warn(`Skipping collecting attachment ${attachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                return false;
              }
              // eslint-disable-next-line require-atomic-updates -- Ignore possible race condition.
              attachmentMoveResult.newAttachmentPath = await copySafe(app, attachmentMoveResult.oldAttachmentPath, attachmentMoveResult.newAttachmentPath);
              await editLinks(app, note, (link2): MaybeReturn<string> => {
                const linkFile = extractLinkFile(app, link2, note);
                if (linkFile?.path !== attachmentMoveResult.oldAttachmentPath) {
                  return;
                }
                return updateLink({
                  app,
                  link: link2,
                  newSourcePathOrFile: note,
                  newTargetPathOrFile: attachmentMoveResult.newAttachmentPath ?? '',
                  oldSourcePathOrFile: note,
                  oldTargetPathOrFile: attachmentMoveResult.oldAttachmentPath
                });
              });
              break;
            case CollectAttachmentUsedByMultipleNotesMode.Move:
              if (!attachmentMoveResult.newAttachmentPath) {
                console.warn(`Skipping collecting attachment ${attachmentMoveResult.oldAttachmentPath} as it is already in the destination folder.`);
                return false;
              }
              await registerMoveAttachment();
              abortSignal.throwIfAborted();
              break;
            case CollectAttachmentUsedByMultipleNotesMode.Prompt: {
              const { mode, shouldUseSameActionForOtherProblematicAttachments } = await selectMode(
                app,
                attachmentMoveResult.oldAttachmentPath,
                backlinksSorted
              );
              if (shouldUseSameActionForOtherProblematicAttachments) {
                ctx.collectAttachmentUsedByMultipleNotesMode = mode;
              }
              return applyCollectAttachmentUsedByMultipleNotesMode(mode);
            }
            case CollectAttachmentUsedByMultipleNotesMode.Skip:
              console.warn(
                `Skipping collecting attachment ${attachmentMoveResult.oldAttachmentPath} as it is referenced by multiple notes.\n${backlinksStr}`
              );
              return false;
            default:
              throw new Error(`Unknown collect attachment used by multiple notes mode: ${plugin.settings.collectAttachmentUsedByMultipleNotesMode}`);
          }

          return true;
        }

        if (
          !await applyCollectAttachmentUsedByMultipleNotesMode(
            ctx.collectAttachmentUsedByMultipleNotesMode ?? plugin.settings.collectAttachmentUsedByMultipleNotesMode
          )
        ) {
          abortSignal.throwIfAborted();
          continue;
        }
      } else {
        abortSignal.throwIfAborted();
        await registerMoveAttachment();
        abortSignal.throwIfAborted();
      }

      async function registerMoveAttachment(): Promise<void> {
        abortSignal.throwIfAborted();
        if (!attachmentMoveResult?.newAttachmentPath) {
          return;
        }

        // eslint-disable-next-line require-atomic-updates -- Ignore possible race condition.
        attachmentMoveResult.newAttachmentPath = await renameSafe(app, attachmentMoveResult.oldAttachmentPath, attachmentMoveResult.newAttachmentPath);
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
    notice = new Notice(t(($) => $.notice.collectingAttachments, { noteFilePath: note.path }), 0);
  }
}

export function collectAttachmentsEntireVault(plugin: Plugin): void {
  addToQueue({
    abortSignal: plugin.abortSignal,
    app: plugin.app,
    operationFn: (abortSignal) => collectAttachmentsInAbstractFilesImpl(plugin, [plugin.app.vault.getRoot()], abortSignal),
    operationName: t(($) => $.commands.collectAttachmentsEntireVault)
  });
}

export function collectAttachmentsInAbstractFiles(plugin: Plugin, abstractFiles: TAbstractFile[]): void {
  addToQueue({
    abortSignal: plugin.abortSignal,
    app: plugin.app,
    operationFn: (abortSignal) => collectAttachmentsInAbstractFilesImpl(plugin, abstractFiles, abortSignal),
    operationName: t(($) => $.menuItems.collectAttachmentsInFile)
  });
}

export async function getProperAttachmentPath(options: GetProperAttachmentPathOptions): Promise<null | string> {
  const newAttachmentPath = await getAttachmentFilePath({
    app: options.plugin.app,
    context: options.actionContext as unknown as AttachmentPathContext,
    notePathOrFile: options.noteFilePath,
    oldAttachmentPathOrFile: options.attachmentFile,
    shouldSkipDuplicateCheck: true
  });

  if (options.attachmentFile.path === newAttachmentPath) {
    return null;
  }

  return newAttachmentPath;
}

export function isNoteEx(plugin: Plugin, pathOrFile: null | PathOrAbstractFile): boolean {
  if (!pathOrFile || !isNote(plugin.app, pathOrFile)) {
    return false;
  }

  const path = getPath(plugin.app, pathOrFile);
  return plugin.settings.treatAsAttachmentExtensions.every((extension) => !path.endsWith(extension));
}

async function collectAttachmentsInAbstractFilesImpl(plugin: Plugin, abstractFiles: TAbstractFile[], abortSignal: AbortSignal): Promise<void> {
  abortSignal.throwIfAborted();
  const singleFile: null | TFile = abstractFiles.length === 1 && isFile(abstractFiles[0]) ? abstractFiles[0] : null;

  if (singleFile && plugin.settings.isPathIgnored(singleFile.path)) {
    new Notice(t(($) => $.notice.notePathIsIgnored));
    console.warn(`Cannot collect attachments in the note as note path is ignored: ${singleFile.path}.`);
    return;
  }

  const canCollectAttachments = !!singleFile || (await confirm({
    app: plugin.app,
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
  plugin.consoleDebug(`Collect attachments in files:\n${abstractFiles.map((abstractFile) => abstractFile.path).join('\n')}`);
  const noteFilesSet = new Set<TFile>();

  for (const abstractFile of abstractFiles) {
    if (isFile(abstractFile) && isNote(plugin.app, abstractFile)) {
      noteFilesSet.add(abstractFile);
    }

    if (isFolder(abstractFile)) {
      Vault.recurseChildren(abstractFile, (child) => {
        if (isFile(child) && isNote(plugin.app, child)) {
          noteFilesSet.add(child);
        }
      });
    }
  }

  const noteFiles = Array.from(noteFilesSet);
  noteFiles.sort((a, b) => a.path.localeCompare(b.path));

  const ctx: CollectAttachmentContext = {};
  const abortController = new AbortController();

  const combinedAbortSignal = abortSignalAny(abortController.signal, plugin.abortSignal);

  await loop({
    abortSignal: combinedAbortSignal,
    buildNoticeMessage: (noteFile, iterationStr) => t(($) => $.attachmentCollector.progressBar.message, { iterationStr, noteFilePath: noteFile.path }),
    items: noteFiles,
    processItem: async (noteFile) => {
      combinedAbortSignal.throwIfAborted();
      if (plugin.settings.isPathIgnored(noteFile.path)) {
        console.warn(`Cannot collect attachments in the note as note path is ignored: ${noteFile.path}.`);
        return;
      }
      await collectAttachments(plugin, noteFile, ctx, combinedAbortSignal);
      combinedAbortSignal.throwIfAborted();
      if (ctx.isAborted) {
        abortController.abort();
      }
    },
    progressBarTitle: `${plugin.manifest.name}: ${t(($) => $.attachmentCollector.progressBar.title)}`,
    shouldContinueOnError: true,
    shouldShowProgressBar: true
  });
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

async function prepareAttachmentToMove(
  plugin: Plugin,
  reference: Reference,
  newNotePath: string,
  oldNotePath: string,
  oldAttachmentPaths: Set<string>
): Promise<AttachmentMoveResult | null> {
  const app = plugin.app;

  const oldAttachmentFile = extractLinkFile(app, reference, oldNotePath, true);

  if (!oldAttachmentFile) {
    return null;
  }

  if (isNoteEx(plugin, oldAttachmentFile)) {
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

  const newAttachmentPath = await getProperAttachmentPath({
    actionContext: ActionContext.CollectAttachments,
    attachmentFile: oldAttachmentFile,
    noteFilePath: newNotePath,
    plugin,
    reference
  });

  return {
    newAttachmentPath,
    oldAttachmentPath: oldAttachmentFile.path
  };
}
