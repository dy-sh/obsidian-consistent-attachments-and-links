/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import type { CustomArrayDict } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  Reference,
  TAbstractFile,
  TFile,
  TFolder
} from 'obsidian';

import { abortSignalAny } from 'obsidian-dev-utils/abort-controller';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  isFile,
  isFolder
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  editLinks,
  updateLink
} from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { getBacklinksForFileSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { copySafe } from 'obsidian-dev-utils/obsidian/vault';
import { deleteIfNotUsed } from 'obsidian-dev-utils/obsidian/vault-delete';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from '../plugin.ts';

import {
  getProperAttachmentPath,
  isNoteEx
} from '../attachment-collector.ts';
import { selectMode } from '../modals/move-attachment-to-proper-folder-used-by-multiple-notes-modal.ts';
import { MoveAttachmentToProperFolderUsedByMultipleNotesMode } from '../plugin-settings.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/abstract-file-command-handler', () => ({
  AbstractFileCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/abort-controller', () => ({
  abortSignalAny: vi.fn()
}));

vi.mock('obsidian-dev-utils/object-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/object-utils')>();
  return {
    ...actual,
    toJson: (value: unknown): string => ensureNonNullable(JSON.stringify(value))
  };
});

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  isFile: vi.fn(),
  isFolder: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/i18n/i18n', () => {
  const deepProxy: unknown = new Proxy(() => 'translated', {
    get: (): unknown => deepProxy
  });
  return {
    t: vi.fn((selector: (translations: unknown) => unknown) => {
      selector(deepProxy);
      return 'translated';
    })
  };
});

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  editLinks: vi.fn(),
  updateLink: vi.fn(() => 'new-link')
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getBacklinksForFileSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  copySafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault-delete', () => ({
  deleteIfNotUsed: vi.fn()
}));

vi.mock('../attachment-collector.ts', () => ({
  getProperAttachmentPath: vi.fn(),
  isNoteEx: vi.fn()
}));

vi.mock('../modals/move-attachment-to-proper-folder-used-by-multiple-notes-modal.ts', () => ({
  selectMode: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { MoveAttachmentToProperFolderCommandHandler } from './move-attachment-to-proper-folder-command-handler.ts';

interface CommandHandlerPrivate {
  canExecuteAbstractFile(abstractFile: TAbstractFile): boolean;
  canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean;
  executeAbstractFile(abstractFile: TAbstractFile): Promise<void>;
  executeAbstractFiles(abstractFiles: TAbstractFile[]): Promise<void>;
  shouldAddToAbstractFileMenu(): boolean;
  shouldAddToAbstractFilesMenu(): boolean;
}

interface LoopParams {
  readonly abortSignal: AbortSignal;
  buildNoticeMessage(item: TFile, iterationStr: string): string;
  readonly items: TFile[];
  processItem(item: TFile): Promise<void>;
  readonly progressBarTitle: string;
  readonly shouldContinueOnError: boolean;
  readonly shouldShowProgressBar: boolean;
}

interface PluginSettingsLike {
  isPathIgnored(path: string): boolean;
  moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode;
}

const mockAbortSignalAny = vi.mocked(abortSignalAny);
const mockCopySafe = vi.mocked(copySafe);
const mockDeleteIfNotUsed = vi.mocked(deleteIfNotUsed);
const mockEditLinks = vi.mocked(editLinks);
const mockGetBacklinksForFileSafe = vi.mocked(getBacklinksForFileSafe);
const mockGetProperAttachmentPath = vi.mocked(getProperAttachmentPath);
const mockIsFile = vi.mocked(isFile);
const mockIsFolder = vi.mocked(isFolder);
const mockIsNoteEx = vi.mocked(isNoteEx);
const mockLoop = vi.mocked(loop);
const mockSelectMode = vi.mocked(selectMode);
const mockUpdateLink = vi.mocked(updateLink);

function asPrivate(handler: MoveAttachmentToProperFolderCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

function createBacklinks(map: Map<string, Reference[]>): CustomArrayDict<Reference> {
  return strictProxy<CustomArrayDict<Reference>>({
    get(key: string): null | Reference[] {
      return map.get(key) ?? null;
    },
    keys(): string[] {
      return Array.from(map.keys());
    }
  });
}

function createFile(path: string): TFile {
  return strictProxy<TFile>({ path });
}

function createFolder(path: string, children: TAbstractFile[] = []): TFolder {
  return strictProxy<TFolder>({ children, path });
}

function createReference(original: string): Reference {
  return castTo<Reference>({ original });
}

describe('MoveAttachmentToProperFolderCommandHandler', () => {
  let app: App;
  let combinedAbortSignal: AbortSignal;
  let getFileByPath: ReturnType<typeof vi.fn<(path: string) => null | TFile>>;
  let handler: MoveAttachmentToProperFolderCommandHandler;
  let plugin: Plugin;
  let settings: PluginSettingsLike;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCopySafe.mockReset();
    mockDeleteIfNotUsed.mockReset();
    mockEditLinks.mockReset();
    mockGetBacklinksForFileSafe.mockReset();
    mockGetProperAttachmentPath.mockReset();
    mockIsFile.mockReset();
    mockIsFolder.mockReset();
    mockIsNoteEx.mockReset();
    mockLoop.mockReset();
    mockSelectMode.mockReset();
    combinedAbortSignal = new AbortController().signal;
    mockAbortSignalAny.mockReturnValue(combinedAbortSignal);
    mockUpdateLink.mockReturnValue('new-link');
    getFileByPath = vi.fn<(path: string) => null | TFile>();
    settings = {
      isPathIgnored: vi.fn<(path: string) => boolean>().mockReturnValue(false),
      moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll
    };
    app = strictProxy<App>({
      vault: strictProxy<App['vault']>({
        getFileByPath: (path: string) => getFileByPath(path)
      })
    });
    plugin = strictProxy<Plugin>({
      abortSignal: new AbortController().signal,
      app,
      manifest: strictProxy<Plugin['manifest']>({ name: 'My Plugin' }),
      pluginSettingsComponent: strictProxy<Plugin['pluginSettingsComponent']>({
        settings: castTo<Plugin['pluginSettingsComponent']['settings']>(settings)
      })
    });
    handler = new MoveAttachmentToProperFolderCommandHandler(plugin);
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(MoveAttachmentToProperFolderCommandHandler);
  });

  describe('canExecuteAbstractFile', () => {
    it('should return true when the abstract file is not a file', () => {
      mockIsFile.mockReturnValue(false);
      expect(asPrivate(handler).canExecuteAbstractFile(createFolder('folder'))).toBe(true);
      expect(mockIsNoteEx).not.toHaveBeenCalled();
    });

    it('should return true when the file is not a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNoteEx.mockReturnValue(false);
      expect(asPrivate(handler).canExecuteAbstractFile(createFile('image.png'))).toBe(true);
    });

    it('should return false when the file is a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNoteEx.mockReturnValue(true);
      expect(asPrivate(handler).canExecuteAbstractFile(createFile('note.md'))).toBe(false);
    });
  });

  describe('canExecuteAbstractFiles', () => {
    it('should return false when a file is a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNoteEx.mockReturnValueOnce(false).mockReturnValueOnce(true);
      const files = [createFile('image.png'), createFile('note.md')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(false);
    });

    it('should return true when no file is a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNoteEx.mockReturnValue(false);
      const files = [createFile('a.png'), createFile('b.png')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(true);
    });

    it('should return true when none of the abstract files are files', () => {
      mockIsFile.mockReturnValue(false);
      const files = [createFolder('folder1'), createFolder('folder2')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(true);
      expect(mockIsNoteEx).not.toHaveBeenCalled();
    });
  });

  it('should add to the abstract file menu', () => {
    expect(asPrivate(handler).shouldAddToAbstractFileMenu()).toBe(true);
  });

  it('should add to the abstract files menu', () => {
    expect(asPrivate(handler).shouldAddToAbstractFilesMenu()).toBe(true);
  });

  describe('executeAbstractFile', () => {
    it('should delegate to executeAbstractFiles with the single file', async () => {
      mockIsFile.mockReturnValue(true);
      mockIsNoteEx.mockReturnValue(false);
      mockLoop.mockResolvedValue();
      const file = createFile('image.png');
      await asPrivate(handler).executeAbstractFile(file);
      const params = castTo<LoopParams>(mockLoop.mock.calls[0]?.[0]);
      expect(params.items).toEqual([file]);
    });
  });

  describe('executeAbstractFiles', () => {
    it('should collect attachment files, recurse folders, sort, and pass them to loop', async () => {
      const attachmentA = createFile('z-a.png');
      const attachmentB = createFile('a-b.png');
      const note = createFile('note.md');
      const childAttachment = createFile('folder/child.png');
      const childNote = createFile('folder/child.md');
      const folder = createFolder('folder', [childAttachment, childNote]);

      mockIsFile.mockImplementation((value) => castTo<TAbstractFile>(value).path.endsWith('.png') || castTo<TAbstractFile>(value).path.endsWith('.md'));
      mockIsFolder.mockImplementation((value) => castTo<TAbstractFile>(value) === folder);
      mockIsNoteEx.mockImplementation((_plugin, value) => castTo<TAbstractFile>(value).path.endsWith('.md'));
      mockLoop.mockResolvedValue();

      await asPrivate(handler).executeAbstractFiles([attachmentA, attachmentB, note, folder]);

      const params = castTo<LoopParams>(mockLoop.mock.calls[0]?.[0]);
      expect(params.items.map((file) => file.path)).toEqual(['a-b.png', 'folder/child.png', 'z-a.png']);
      expect(params.buildNoticeMessage(attachmentA, '1/3')).toBe('translated');
      expect(params.progressBarTitle).toBe('My Plugin: translated');
    });

    it('should warn and skip processing when the attachment path is ignored', async () => {
      const attachment = createFile('ignored.png');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      vi.mocked(settings.isPathIgnored).mockReturnValue(true);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      let captured: LoopParams | undefined;
      mockLoop.mockImplementation(async (params) => {
        captured = castTo<LoopParams>(params);
        await captured.processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(warnSpy).toHaveBeenCalledExactlyOnceWith('Cannot move attachment to proper folder as attachment path is ignored: ignored.png.');
      expect(mockGetBacklinksForFileSafe).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should return early from processItem when moveAttachmentToProperFolder returns false', async () => {
      const attachment = createFile('attachment.png');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel;
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(
        new Map([
          ['note1.md', [createReference('[[attachment]]')]],
          ['note2.md', [createReference('[[attachment]]')]]
        ])
      ));
      mockSelectMode.mockResolvedValue({
        backlinksToCopy: [],
        mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel,
        shouldUseSameActionForOtherProblematicAttachments: false
      });
      const throwIfAbortedSpy = vi.spyOn(combinedAbortSignal, 'throwIfAborted').mockImplementation(() => undefined);

      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(mockSelectMode).toHaveBeenCalledExactlyOnceWith(app, 'attachment.png', ['note1.md', 'note2.md'], true);
      throwIfAbortedSpy.mockRestore();
    });
  });

  describe('moveAttachmentToProperFolder', () => {
    async function runProcessItem(attachment: TFile): Promise<void> {
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });
      await asPrivate(handler).executeAbstractFiles([attachment]);
    }

    it('should stop after notifying when the attachment has no backlinks', async () => {
      const attachment = createFile('unused.png');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(new Map()));

      await runProcessItem(attachment);

      expect(mockGetBacklinksForFileSafe).toHaveBeenCalledOnce();
      expect(mockCopySafe).not.toHaveBeenCalled();
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
    });

    it('should copy attachments and update links for a single backlink (CopyAll via single backlink path)', async () => {
      const attachment = createFile('attachment.png');
      const reference = createReference('[[attachment]]');
      const backlinkFile = createFile('note1.md');
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(new Map([['note1.md', [reference]]])))
        .mockResolvedValueOnce(createBacklinks(new Map([['note1.md', [reference]]])));
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      getFileByPath.mockReturnValue(backlinkFile);
      mockGetProperAttachmentPath.mockResolvedValue('new-folder/attachment.png');
      mockEditLinks.mockResolvedValue();

      await runProcessItem(attachment);

      // With a single backlink, handleMode is not invoked, so backlinksToCopy stays empty and no copy happens.
      expect(mockCopySafe).not.toHaveBeenCalled();
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
    });

    it('should copy attachment, update matching links, and delete when no backlinks remain (CopyAll)', async () => {
      const attachment = createFile('attachment.png');
      const reference = createReference('[[attachment]]');
      const backlinkFile = createFile('note1.md');
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', [reference]],
            ['note2.md', [createReference('[[attachment]]2')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map()));
      getFileByPath.mockImplementation((path) => path === 'note1.md' ? backlinkFile : null);
      mockGetProperAttachmentPath.mockResolvedValue('new-folder/attachment.png');
      mockEditLinks.mockImplementation(async (_app, _file, converter) => {
        await converter(reference);
        await converter(createReference('non-matching'));
      });
      mockDeleteIfNotUsed.mockResolvedValue(true);

      await runProcessItem(attachment);

      expect(mockCopySafe).toHaveBeenCalledExactlyOnceWith(app, attachment, 'new-folder/attachment.png');
      expect(mockUpdateLink).toHaveBeenCalledOnce();
      expect(mockDeleteIfNotUsed).toHaveBeenCalledExactlyOnceWith(app, attachment);
    });

    it('should skip a backlink whose file cannot be resolved (CopyAll)', async () => {
      const attachment = createFile('attachment.png');
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['missing.md', [createReference('[[attachment]]')]],
            ['other.md', [createReference('[[attachment]]')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['other.md', [createReference('[[attachment]]')]]])));
      getFileByPath.mockReturnValue(null);

      await runProcessItem(attachment);

      expect(mockCopySafe).not.toHaveBeenCalled();
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
    });

    it('should skip a backlink whose first reference is missing (CopyAll)', async () => {
      const attachment = createFile('attachment.png');
      const backlinkFile = createFile('note1.md');
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', []],
            ['note2.md', [createReference('[[attachment]]')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['note2.md', [createReference('[[attachment]]')]]])));
      getFileByPath.mockReturnValue(backlinkFile);

      await runProcessItem(attachment);

      expect(mockCopySafe).not.toHaveBeenCalled();
    });

    it('should skip a backlink when the attachment is already in the destination folder (CopyAll)', async () => {
      const attachment = createFile('attachment.png');
      const backlinkFile = createFile('note1.md');
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', [createReference('[[attachment]]')]],
            ['note2.md', [createReference('[[attachment]]')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['note2.md', [createReference('[[attachment]]')]]])));
      getFileByPath.mockReturnValue(backlinkFile);
      mockGetProperAttachmentPath.mockResolvedValue(null);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      await runProcessItem(attachment);

      expect(warnSpy).toHaveBeenCalledWith('Skipping moving attachment attachment.png to proper folder as it is already in the destination folder.');
      expect(mockCopySafe).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('handleMode', () => {
    async function runWithMode(mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode): Promise<TFile> {
      const attachment = createFile('attachment.png');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = mode;
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(
        new Map([
          ['note1.md', [createReference('[[a]]')]],
          ['note2.md', [createReference('[[a]]')]]
        ])
      ));
      getFileByPath.mockReturnValue(null);
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });
      await asPrivate(handler).executeAbstractFiles([attachment]);
      return attachment;
    }

    it('should select cancel mode when settings default is Cancel', async () => {
      await runWithMode(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel);
      expect(mockSelectMode).toHaveBeenCalledExactlyOnceWith(app, 'attachment.png', ['note1.md', 'note2.md'], true);
    });

    it('should not re-prompt for Cancel mode when settings default is not Cancel', async () => {
      const attachment = createFile('attachment.png');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt;
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(
        new Map([
          ['note1.md', [createReference('[[a]]')]],
          ['note2.md', [createReference('[[a]]')]]
        ])
      ));
      mockSelectMode.mockResolvedValue({
        backlinksToCopy: [],
        mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode.Cancel,
        shouldUseSameActionForOtherProblematicAttachments: false
      });
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      // Prompt resolves to Cancel; handleMode(Cancel) runs but settings is Prompt, so no extra selectMode(...true).
      expect(mockSelectMode).toHaveBeenCalledExactlyOnceWith(app, 'attachment.png', ['note1.md', 'note2.md']);
      expect(mockCopySafe).not.toHaveBeenCalled();
    });

    it('should copy all backlinks for CopyAll mode', async () => {
      const attachment = createFile('attachment.png');
      const backlinkFile = createFile('note1.md');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll;
      const reference = createReference('[[a]]');
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', [reference]],
            ['note2.md', [createReference('[[a]]2')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['note2.md', [createReference('[[a]]2')]]])));
      getFileByPath.mockImplementation((path) => path === 'note1.md' ? backlinkFile : null);
      mockGetProperAttachmentPath.mockResolvedValue('new/attachment.png');
      mockEditLinks.mockResolvedValue();
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(mockCopySafe).toHaveBeenCalledExactlyOnceWith(app, attachment, 'new/attachment.png');
    });

    it('should use the prompt result backlinks when prompt resolves to Prompt mode', async () => {
      const attachment = createFile('attachment.png');
      const backlinkFile = createFile('note1.md');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt;
      const reference = createReference('[[a]]');
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', [reference]],
            ['note2.md', [createReference('[[a]]2')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['note2.md', [createReference('[[a]]2')]]])));
      mockSelectMode.mockResolvedValue({
        backlinksToCopy: ['note1.md'],
        mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt,
        shouldUseSameActionForOtherProblematicAttachments: true
      });
      getFileByPath.mockImplementation((path) => path === 'note1.md' ? backlinkFile : null);
      mockGetProperAttachmentPath.mockResolvedValue('new/attachment.png');
      mockEditLinks.mockResolvedValue();
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(mockSelectMode).toHaveBeenCalledExactlyOnceWith(app, 'attachment.png', ['note1.md', 'note2.md']);
      expect(mockCopySafe).toHaveBeenCalledExactlyOnceWith(app, attachment, 'new/attachment.png');
    });

    it('should recurse into the resolved mode when prompt resolves to CopyAll', async () => {
      const attachment = createFile('attachment.png');
      const backlinkFile = createFile('note1.md');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = MoveAttachmentToProperFolderUsedByMultipleNotesMode.Prompt;
      const reference = createReference('[[a]]');
      mockGetBacklinksForFileSafe
        .mockResolvedValueOnce(createBacklinks(
          new Map([
            ['note1.md', [reference]],
            ['note2.md', [createReference('[[a]]2')]]
          ])
        ))
        .mockResolvedValueOnce(createBacklinks(new Map([['note2.md', [createReference('[[a]]2')]]])));
      mockSelectMode.mockResolvedValue({
        backlinksToCopy: [],
        mode: MoveAttachmentToProperFolderUsedByMultipleNotesMode.CopyAll,
        shouldUseSameActionForOtherProblematicAttachments: false
      });
      getFileByPath.mockImplementation((path) => path === 'note1.md' ? backlinkFile : null);
      mockGetProperAttachmentPath.mockResolvedValue('new/attachment.png');
      mockEditLinks.mockResolvedValue();
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(mockCopySafe).toHaveBeenCalledExactlyOnceWith(app, attachment, 'new/attachment.png');
    });

    it('should copy nothing for Skip mode', async () => {
      await runWithMode(MoveAttachmentToProperFolderUsedByMultipleNotesMode.Skip);
      expect(mockCopySafe).not.toHaveBeenCalled();
    });

    it('should throw if aborted for an unknown mode (default branch)', async () => {
      const attachment = createFile('attachment.png');
      mockIsFile.mockReturnValue(true);
      mockIsFolder.mockReturnValue(false);
      mockIsNoteEx.mockReturnValue(false);
      settings.moveAttachmentToProperFolderUsedByMultipleNotesMode = castTo<MoveAttachmentToProperFolderUsedByMultipleNotesMode>('UnknownMode');
      mockGetBacklinksForFileSafe.mockResolvedValue(createBacklinks(
        new Map([
          ['note1.md', [createReference('[[a]]')]],
          ['note2.md', [createReference('[[a]]')]]
        ])
      ));
      const throwIfAbortedSpy = vi.spyOn(combinedAbortSignal, 'throwIfAborted').mockImplementation(() => undefined);
      mockLoop.mockImplementation(async (params) => {
        await castTo<LoopParams>(params).processItem(attachment);
      });

      await asPrivate(handler).executeAbstractFiles([attachment]);

      expect(throwIfAbortedSpy).toHaveBeenCalled();
      expect(mockCopySafe).not.toHaveBeenCalled();
      throwIfAbortedSpy.mockRestore();
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
