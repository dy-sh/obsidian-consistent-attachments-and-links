import type {
  App,
  Reference,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';
import type {
  Mock,
  MockInstance
} from 'vitest';

import {
  Notice,
  Vault
} from 'obsidian';
import { abortSignalAny } from 'obsidian-dev-utils/abort-controller';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getAttachmentFilePath } from 'obsidian-dev-utils/obsidian/attachment-path';
import {
  getPath,
  isCanvasFile,
  isFile,
  isFolder,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
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
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from './plugin.ts';

import { selectMode } from './modals/collect-attachment-used-by-multiple-notes-modal.ts';
import { CollectAttachmentUsedByMultipleNotesMode } from './plugin-settings.ts';

vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  const noticeHide = vi.fn();
  class MockNotice {
    public static instances: MockNotice[] = [];
    public hide = noticeHide;

    public constructor(_message: unknown, _timeout?: number) {
      MockNotice.instances.push(this);
    }
  }
  return {
    ...actual,
    Notice: MockNotice
  };
});

vi.mock('obsidian-dev-utils/abort-controller', () => ({
  abortSignalAny: vi.fn()
}));

vi.mock('obsidian-dev-utils/async', () => ({
  invokeAsyncSafely: vi.fn()
}));

vi.mock('obsidian-dev-utils/html-element', () => ({
  appendCodeBlock: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/attachment-path', () => ({
  AttachmentPathContext: { Unknown: 'Unknown' },
  getAttachmentFilePath: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getPath: vi.fn(),
  isCanvasFile: vi.fn(),
  isFile: vi.fn(),
  isFolder: vi.fn(),
  isNote: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/i18n/i18n', () => ({
  t: vi.fn((selector: (translations: unknown) => unknown): string => {
    const accessor: unknown = new Proxy((): undefined => undefined, {
      apply: (): string => 'translated',
      get: (): unknown => accessor
    });
    selector(accessor);
    return 'translated';
  })
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  editLinks: vi.fn(),
  extractLinkFile: vi.fn(),
  updateLink: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn(),
  getBacklinksForFileSafe: vi.fn(),
  getCacheSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/modals/confirm', () => ({
  confirm: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/queue', () => ({
  addToQueue: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  copySafe: vi.fn(),
  renameSafe: vi.fn()
}));

vi.mock('./modals/collect-attachment-used-by-multiple-notes-modal.ts', () => ({
  selectMode: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  collectAttachments,
  collectAttachmentsEntireVault,
  collectAttachmentsInAbstractFiles,
  getProperAttachmentPath,
  isNoteEx
} from './attachment-collector.ts';

interface CtxLike {
  collectAttachmentUsedByMultipleNotesMode?: CollectAttachmentUsedByMultipleNotesMode;
  isAborted?: boolean;
}

interface LoopOptionsLike {
  buildNoticeMessage(item: TFile, iterationStr: string): string;
  items: TFile[];
  processItem(item: TFile): Promise<void>;
}

interface NoticeMockLike {
  hide: ReturnType<typeof vi.fn>;
}

interface NoticeStaticLike {
  instances: NoticeMockLike[];
}

interface QueueParamsLike {
  app: App;
  operationFn(abortSignal: AbortSignal): Promise<void>;
  operationName: string;
}

interface SettingsLike {
  collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode;
  isExcludedFromAttachmentCollecting(path: string): boolean;
  isPathIgnored(path: string): boolean;
  treatAsAttachmentExtensions: string[];
}

const mockAbortSignalAny = vi.mocked(abortSignalAny);
const mockInvokeAsyncSafely = vi.mocked(invokeAsyncSafely);
const mockGetAttachmentFilePath = vi.mocked(getAttachmentFilePath);
const mockGetPath = vi.mocked(getPath);
const mockIsCanvasFile = vi.mocked(isCanvasFile);
const mockIsFile = vi.mocked(isFile);
const mockIsFolder = vi.mocked(isFolder);
const mockIsNote = vi.mocked(isNote);
const mockEditLinks = vi.mocked(editLinks);
const mockExtractLinkFile = vi.mocked(extractLinkFile);
const mockUpdateLink = vi.mocked(updateLink);
const mockLoop = vi.mocked(loop);
const mockGetAllLinks = vi.mocked(getAllLinks);
const mockGetBacklinksForFileSafe = vi.mocked(getBacklinksForFileSafe);
const mockGetCacheSafe = vi.mocked(getCacheSafe);
const mockConfirm = vi.mocked(confirm);
const mockAddToQueue = vi.mocked(addToQueue);
const mockCopySafe = vi.mocked(copySafe);
const mockRenameSafe = vi.mocked(renameSafe);
const mockSelectMode = vi.mocked(selectMode);

function createBacklinks(keys: string[]): Awaited<ReturnType<typeof getBacklinksForFileSafe>> {
  return strictProxy<Awaited<ReturnType<typeof getBacklinksForFileSafe>>>({
    keys: () => keys
  });
}

function createFile(path: string, deleted = false): TFile {
  return strictProxy<TFile>({
    deleted,
    path
  });
}

function createReference(overrides: Partial<Reference> = {}): Reference {
  return strictProxy<Reference>({
    link: 'img.png',
    original: '![[img.png]]',
    ...overrides
  });
}

describe('attachment-collector', () => {
  let app: App;
  let plugin: Plugin;
  let readJson: Mock<(path: string) => Promise<null | object>>;
  let getRoot: Mock<() => TFolder>;
  let settings: SettingsLike;
  let warnSpy: MockInstance<typeof console.warn>;
  let errorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode.Move,
      isExcludedFromAttachmentCollecting: vi.fn().mockReturnValue(false),
      isPathIgnored: vi.fn().mockReturnValue(false),
      treatAsAttachmentExtensions: []
    };
    readJson = vi.fn<(path: string) => Promise<null | object>>();
    getRoot = vi.fn<() => TFolder>().mockReturnValue(strictProxy<TFolder>({ path: '/' }));
    app = strictProxy<App>({
      vault: strictProxy<App['vault']>({
        getRoot,
        readJson
      })
    });
    plugin = strictProxy<Plugin>({
      abortSignal: new AbortController().signal,
      app,
      manifest: strictProxy<Plugin['manifest']>({ name: 'Plugin' }),
      pluginSettingsComponent: strictProxy<Plugin['pluginSettingsComponent']>({
        settings: castTo<Plugin['pluginSettingsComponent']['settings']>(settings)
      })
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockInvokeAsyncSafely.mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('isNoteEx', () => {
    it('should return false when pathOrFile is null', () => {
      expect(isNoteEx(plugin, null)).toBe(false);
    });

    it('should return false when not a note', () => {
      mockIsNote.mockReturnValue(false);
      expect(isNoteEx(plugin, 'img.png')).toBe(false);
    });

    it('should return true when a note and not treated as attachment', () => {
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('note.md');
      settings.treatAsAttachmentExtensions = ['.excalidraw.md'];
      expect(isNoteEx(plugin, 'note.md')).toBe(true);
    });

    it('should return false when path ends with a treated-as-attachment extension', () => {
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('a.excalidraw.md');
      settings.treatAsAttachmentExtensions = ['.excalidraw.md'];
      expect(isNoteEx(plugin, 'a.excalidraw.md')).toBe(false);
    });
  });

  describe('getProperAttachmentPath', () => {
    it('should return null when the new path equals the current path', async () => {
      const attachmentFile = createFile('img.png');
      mockGetAttachmentFilePath.mockResolvedValue('img.png');
      const result = await getProperAttachmentPath({
        attachmentFile,
        noteFilePath: 'note.md',
        plugin,
        reference: createReference()
      });
      expect(result).toBeNull();
    });

    it('should return the new path when it differs', async () => {
      const attachmentFile = createFile('img.png');
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      const result = await getProperAttachmentPath({
        attachmentFile,
        noteFilePath: 'note.md',
        plugin,
        reference: createReference()
      });
      expect(result).toBe('attachments/img.png');
    });
  });

  describe('collectAttachmentsEntireVault', () => {
    it('should enqueue an operation for the vault root', () => {
      collectAttachmentsEntireVault(plugin);
      const params = castTo<QueueParamsLike>(mockAddToQueue.mock.calls[0]?.[0]);
      expect(params.app).toBe(app);
      expect(params.operationName).toBe('translated');
    });

    it('should run the operation against the vault root', async () => {
      mockAbortSignalAny.mockReturnValue(new AbortController().signal);
      mockLoop.mockResolvedValue(undefined);
      mockConfirm.mockResolvedValue(true);
      mockIsFile.mockReturnValue(false);
      mockIsFolder.mockReturnValue(false);
      collectAttachmentsEntireVault(plugin);
      const params = castTo<QueueParamsLike>(mockAddToQueue.mock.calls[0]?.[0]);
      await params.operationFn(new AbortController().signal);
      expect(getRoot).toHaveBeenCalled();
      expect(mockLoop).toHaveBeenCalled();
    });
  });

  describe('collectAttachmentsInAbstractFiles', () => {
    it('should enqueue an operation for the given files', () => {
      const files = [strictProxy<TAbstractFile>({ path: 'a.md' })];
      collectAttachmentsInAbstractFiles(plugin, files);
      const params = castTo<QueueParamsLike>(mockAddToQueue.mock.calls[0]?.[0]);
      expect(params.app).toBe(app);
    });
  });

  describe('collectAttachments', () => {
    let abortSignal: AbortSignal;
    let note: TFile;

    beforeEach(() => {
      abortSignal = new AbortController().signal;
      note = createFile('note.md');
      mockIsCanvasFile.mockReturnValue(false);
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([]);
    });

    it('should throw immediately when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(collectAttachments(plugin, note, {}, controller.signal)).rejects.toThrow();
    });

    it('should return early when ctx.isAborted is true', async () => {
      await collectAttachments(plugin, note, { isAborted: true }, abortSignal);
      expect(mockGetCacheSafe).not.toHaveBeenCalled();
    });

    it('should return when ctx becomes aborted after reading the cache', async () => {
      const ctx = { isAborted: false };
      mockGetCacheSafe.mockImplementation(async () => {
        ctx.isAborted = true;
        return Promise.resolve(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      });
      await collectAttachments(plugin, note, ctx, abortSignal);
      expect(mockGetAllLinks).not.toHaveBeenCalled();
    });

    it('should return when there is no cache', async () => {
      mockGetCacheSafe.mockResolvedValue(null);
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockGetAllLinks).not.toHaveBeenCalled();
    });

    it('should read links from a canvas file', async () => {
      mockIsCanvasFile.mockReturnValue(true);
      readJson.mockResolvedValue({
        nodes: [
          { file: 'canvas-img.png', type: 'file' },
          { type: 'text' }
        ]
      });
      mockExtractLinkFile.mockReturnValue(null);
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(readJson).toHaveBeenCalledWith('note.md');
      expect(mockGetAllLinks).not.toHaveBeenCalled();
    });

    it('should skip when the attachment cannot be prepared (no link file)', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(null);
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockGetBacklinksForFileSafe).not.toHaveBeenCalled();
    });

    it('should skip when the link file is a note', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('other.md'));
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('other.md');
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockGetBacklinksForFileSafe).not.toHaveBeenCalled();
    });

    it('should skip when the attachment was already seen', async () => {
      mockGetAllLinks.mockReturnValue([createReference(), createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md']));
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockGetBacklinksForFileSafe).toHaveBeenCalledTimes(1);
    });

    it('should skip when the attachment could not be resolved (deleted)', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png', true));
      mockIsNote.mockReturnValue(false);
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('could not be resolved'));
    });

    it('should skip when the attachment is excluded from collecting', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      castTo<ReturnType<typeof vi.fn>>(settings.isExcludedFromAttachmentCollecting).mockReturnValue(true);
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('excluded from attachment collecting'));
    });

    it('should move a single-referenced attachment', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md']));
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockRenameSafe).toHaveBeenCalledWith(app, 'img.png', 'attachments/img.png');
    });

    it('should not rename when the new attachment path is null (single-ref)', async () => {
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('img.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md']));
      await collectAttachments(plugin, note, {}, abortSignal);
      expect(mockRenameSafe).not.toHaveBeenCalled();
    });

    describe('multiple backlinks', () => {
      beforeEach(() => {
        mockGetAllLinks.mockReturnValue([createReference()]);
        mockExtractLinkFile.mockReturnValue(createFile('img.png'));
        mockIsNote.mockReturnValue(false);
        mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
        mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md', 'other.md']));
      });

      it('should cancel and abort in Cancel mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Cancel;
        mockSelectMode.mockResolvedValue({ mode: CollectAttachmentUsedByMultipleNotesMode.Cancel, shouldUseSameActionForOtherProblematicAttachments: false });
        const ctx = {};
        await collectAttachments(plugin, note, ctx, abortSignal);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('referenced by multiple notes'));
        expect(mockSelectMode).toHaveBeenCalledWith(app, 'img.png', ['note.md', 'other.md'], true);
        expect(castTo<CtxLike>(ctx).isAborted).toBe(true);
      });

      it('should not invoke selectMode in Cancel mode when the setting differs', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Move;
        const ctx = { collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode.Cancel };
        await collectAttachments(plugin, note, ctx, abortSignal);
        expect(mockSelectMode).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalled();
      });

      it('should copy and rewrite links in Copy mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Copy;
        mockCopySafe.mockResolvedValue('attachments/img.png');
        let matchingResult: unknown;
        let nonMatchingResult: unknown;
        mockEditLinks.mockImplementation(async (_app, _note, linkHandler) => {
          matchingResult = linkHandler(createReference({ link: 'img.png' }));
          nonMatchingResult = linkHandler(createReference({ link: 'other.png' }));
          await noopAsync();
        });
        mockExtractLinkFile.mockImplementation((_app, ref) => {
          return ref.link === 'other.png' ? createFile('other.png') : createFile('img.png');
        });
        mockUpdateLink.mockReturnValue('![](attachments/img.png)');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(mockCopySafe).toHaveBeenCalledWith(app, 'img.png', 'attachments/img.png');
        expect(matchingResult).toBe('![](attachments/img.png)');
        expect(nonMatchingResult).toBeUndefined();
      });

      it('should skip Copy mode when the new attachment path is null', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Copy;
        mockGetAttachmentFilePath.mockResolvedValue('img.png');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(mockCopySafe).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already in the destination folder'));
      });

      it('should fall back to empty string when copying and newAttachmentPath becomes falsy', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Copy;
        mockCopySafe.mockResolvedValue('');
        let handlerResult: unknown;
        mockEditLinks.mockImplementation(async (_app, _note, linkHandler) => {
          handlerResult = linkHandler(createReference({ link: 'img.png' }));
          await noopAsync();
        });
        mockExtractLinkFile.mockReturnValue(createFile('img.png'));
        mockUpdateLink.mockReturnValue('![](img.png)');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(handlerResult).toBe('![](img.png)');
        expect(mockUpdateLink).toHaveBeenCalledWith(expect.objectContaining({ newTargetPathOrFile: '' }));
      });

      it('should move in Move mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Move;
        mockRenameSafe.mockResolvedValue('attachments/img.png');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(mockRenameSafe).toHaveBeenCalledWith(app, 'img.png', 'attachments/img.png');
      });

      it('should skip Move mode when the new attachment path is null', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Move;
        mockGetAttachmentFilePath.mockResolvedValue('img.png');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(mockRenameSafe).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already in the destination folder'));
      });

      it('should skip in Skip mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Skip;
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('referenced by multiple notes'));
        expect(mockRenameSafe).not.toHaveBeenCalled();
      });

      it('should prompt and apply the chosen mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Prompt;
        mockSelectMode.mockResolvedValue({ mode: CollectAttachmentUsedByMultipleNotesMode.Move, shouldUseSameActionForOtherProblematicAttachments: false });
        mockRenameSafe.mockResolvedValue('attachments/img.png');
        await collectAttachments(plugin, note, {}, abortSignal);
        expect(mockSelectMode).toHaveBeenCalledWith(app, 'img.png', ['note.md', 'other.md']);
        expect(mockRenameSafe).toHaveBeenCalled();
      });

      it('should remember the chosen mode for other attachments when requested', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Prompt;
        mockSelectMode.mockResolvedValue({ mode: CollectAttachmentUsedByMultipleNotesMode.Skip, shouldUseSameActionForOtherProblematicAttachments: true });
        const ctx: CtxLike = {};
        await collectAttachments(plugin, note, ctx, abortSignal);
        expect(ctx.collectAttachmentUsedByMultipleNotesMode).toBe(CollectAttachmentUsedByMultipleNotesMode.Skip);
      });

      it('should throw for an unknown mode', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = castTo<CollectAttachmentUsedByMultipleNotesMode>('Unknown');
        await expect(collectAttachments(plugin, note, {}, abortSignal)).rejects.toThrow('Unknown collect attachment used by multiple notes mode');
      });

      it('should use the ctx mode when present', async () => {
        settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Move;
        const ctx = { collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode.Skip };
        await collectAttachments(plugin, note, ctx, abortSignal);
        expect(mockRenameSafe).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('referenced by multiple notes'));
      });
    });

    it('should return early on a subsequent link iteration once ctx becomes aborted', async () => {
      mockGetAllLinks.mockReturnValue([createReference({ link: 'a.png' }), createReference({ link: 'b.png' })]);
      mockExtractLinkFile.mockReturnValue(createFile('a.png'));
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/a.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md', 'other.md']));
      settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Cancel;
      const ctx = {};
      await collectAttachments(plugin, note, ctx, abortSignal);
      // The first link sets ctx.isAborted; the second iteration returns early.
      expect(mockGetBacklinksForFileSafe).toHaveBeenCalledTimes(1);
      expect(castTo<CtxLike>(ctx).isAborted).toBe(true);
    });

    it('should show the notice while running and hide it on the finally block', async () => {
      const noticeInstances = castTo<NoticeStaticLike>(Notice).instances;
      noticeInstances.length = 0;
      let showNoticeFn: () => unknown = noop;
      let resolveCache: (value: Awaited<ReturnType<typeof getCacheSafe>>) => void = noop;
      const sleepSpy = vi.spyOn(window, 'sleep').mockResolvedValue(undefined);
      try {
        mockInvokeAsyncSafely.mockImplementation((fn) => {
          showNoticeFn = fn;
        });
        mockGetAllLinks.mockReturnValue([]);
        mockGetCacheSafe.mockReturnValue(
          new Promise((resolve) => {
            resolveCache = resolve;
          })
        );
        const promise = collectAttachments(plugin, note, {}, abortSignal);
        // Drive showNotice to completion while the main flow is suspended on getCacheSafe.
        await showNoticeFn();
        expect(noticeInstances).toHaveLength(1);
        resolveCache(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
        await promise;
      } finally {
        sleepSpy.mockRestore();
      }
      expect(noticeInstances[0]?.hide).toHaveBeenCalled();
    });

    it('should not create the notice when the operation already finished', async () => {
      const noticeInstances = castTo<NoticeStaticLike>(Notice).instances;
      noticeInstances.length = 0;
      let showNoticeFn: () => unknown = noop;
      const sleepSpy = vi.spyOn(window, 'sleep').mockResolvedValue(undefined);
      try {
        mockInvokeAsyncSafely.mockImplementation((fn) => {
          showNoticeFn = fn;
        });
        mockGetCacheSafe.mockResolvedValue(null);
        await collectAttachments(plugin, note, {}, abortSignal);
        // The operation already finished (isDone === true), so showNotice creates no Notice.
        await showNoticeFn();
      } finally {
        sleepSpy.mockRestore();
      }
      expect(noticeInstances).toHaveLength(0);
    });
  });

  describe('collectAttachmentsInAbstractFilesImpl (via queue operationFn)', () => {
    async function runOperation(abstractFiles: TAbstractFile[]): Promise<void> {
      collectAttachmentsInAbstractFiles(plugin, abstractFiles);
      const params = mockAddToQueue.mock.calls[0]?.[0];
      const operationFn = castTo<QueueParamsLike>(params).operationFn;
      await operationFn(new AbortController().signal);
    }

    beforeEach(() => {
      mockAbortSignalAny.mockReturnValue(new AbortController().signal);
      mockLoop.mockResolvedValue(undefined);
    });

    it('should throw when the signal is already aborted', async () => {
      collectAttachmentsInAbstractFiles(plugin, []);
      const params = mockAddToQueue.mock.calls[0]?.[0];
      const operationFn = castTo<QueueParamsLike>(params).operationFn;
      const controller = new AbortController();
      controller.abort();
      await expect(operationFn(controller.signal)).rejects.toThrow();
    });

    it('should notice and return when the single file path is ignored', async () => {
      mockIsFile.mockReturnValue(true);
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      await runOperation([createFile('ignored.md')]);
      expect(mockLoop).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('note path is ignored'));
    });

    it('should return when confirmation is declined for multiple files', async () => {
      mockIsFile.mockReturnValue(true);
      mockConfirm.mockResolvedValue(false);
      await runOperation([createFile('a.md'), createFile('b.md')]);
      expect(mockLoop).not.toHaveBeenCalled();
    });

    it('should collect notes from files and folders and run the loop', async () => {
      const noteFile = createFile('a.md');
      const folder = strictProxy<TAbstractFile>({ path: 'folder' });
      const childNote = createFile('folder/c.md');
      mockIsFile.mockImplementation((f) => f === noteFile || f === childNote);
      mockIsFolder.mockImplementation((f) => f === folder);
      mockIsNote.mockReturnValue(true);
      mockConfirm.mockResolvedValue(true);
      const recurseSpy = vi.spyOn(Vault, 'recurseChildren').mockImplementation((_root, cb) => {
        cb(childNote);
      });
      try {
        await runOperation([noteFile, folder]);
      } finally {
        recurseSpy.mockRestore();
      }
      const loopOptions = castTo<LoopOptionsLike>(mockLoop.mock.calls[0]?.[0]);
      expect(loopOptions.items).toEqual([noteFile, childNote]);
    });

    it('should skip a non-note child during folder recursion', async () => {
      const folder = strictProxy<TAbstractFile>({ path: 'folder' });
      const childNonNote = createFile('folder/img.png');
      mockIsFile.mockReturnValue(false);
      mockIsFolder.mockImplementation((f) => f === folder);
      mockIsNote.mockReturnValue(false);
      mockConfirm.mockResolvedValue(true);
      const recurseSpy = vi.spyOn(Vault, 'recurseChildren').mockImplementation((_root, cb) => {
        cb(childNonNote);
      });
      try {
        await runOperation([folder]);
      } finally {
        recurseSpy.mockRestore();
      }
      const loopOptions = castTo<LoopOptionsLike>(mockLoop.mock.calls[0]?.[0]);
      expect(loopOptions.items).toEqual([]);
    });

    it('should process each note via loop processItem', async () => {
      const noteFile = createFile('a.md');
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(true);
      const combinedSignal = new AbortController().signal;
      mockAbortSignalAny.mockReturnValue(combinedSignal);
      mockGetCacheSafe.mockResolvedValue(null);
      mockLoop.mockImplementation(async (options) => {
        await castTo<LoopOptionsLike>(options).processItem(noteFile);
      });
      await runOperation([noteFile]);
      expect(mockGetCacheSafe).toHaveBeenCalledWith(app, noteFile);
    });

    it('should skip an ignored note inside loop processItem', async () => {
      const noteFile = createFile('a.md');
      const otherFile = createFile('b.md');
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(true);
      mockConfirm.mockResolvedValue(true);
      mockAbortSignalAny.mockReturnValue(new AbortController().signal);
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockImplementation((path: string) => path === 'a.md');
      mockLoop.mockImplementation(async (options) => {
        await castTo<LoopOptionsLike>(options).processItem(noteFile);
      });
      await runOperation([noteFile, otherFile]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('note path is ignored'));
      expect(mockGetCacheSafe).not.toHaveBeenCalled();
    });

    it('should abort the controller when the context becomes aborted in processItem', async () => {
      const noteFile = createFile('a.md');
      mockIsFile.mockReturnValue(true);
      mockIsCanvasFile.mockReturnValue(false);
      mockIsNote.mockReturnValue(false);
      mockAbortSignalAny.mockReturnValue(new AbortController().signal);
      mockGetAllLinks.mockReturnValue([createReference()]);
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(['note.md', 'other.md']));
      settings.collectAttachmentUsedByMultipleNotesMode = CollectAttachmentUsedByMultipleNotesMode.Cancel;
      mockLoop.mockImplementation(async (options) => {
        await castTo<LoopOptionsLike>(options).processItem(noteFile);
      });
      await runOperation([noteFile]);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should build progress bar and notice messages', async () => {
      const noteFile = createFile('a.md');
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(true);
      mockAbortSignalAny.mockReturnValue(new AbortController().signal);
      mockLoop.mockImplementation(async (options) => {
        const typed = castTo<LoopOptionsLike>(options);
        expect(typed.buildNoticeMessage(noteFile, '1/1')).toBe('translated');
        await noopAsync();
      });
      await runOperation([noteFile]);
      expect(mockLoop).toHaveBeenCalled();
    });
  });
});
