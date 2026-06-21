import type {
  App,
  TFile
} from 'obsidian';
import type { MockInstance } from 'vitest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { getAttachmentFilePath } from 'obsidian-dev-utils/obsidian/attachment-path';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import {
  getFileOrNull,
  getPath,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  extractLinkFile,
  splitSubpath,
  testEmbed
} from 'obsidian-dev-utils/obsidian/link';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import {
  copySafe,
  createFolderSafe,
  deleteEmptyFolderHierarchy,
  getAvailablePath,
  listSafe,
  renameSafe,
  trashSafe
} from 'obsidian-dev-utils/obsidian/vault';
import { deleteIfNotUsed } from 'obsidian-dev-utils/obsidian/vault-delete';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinksHandler } from './links-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

vi.mock('obsidian-dev-utils/obsidian/attachment-path', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/attachment-path')>(),
  getAttachmentFilePath: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getFileOrNull: vi.fn(),
  getPath: vi.fn(),
  isNote: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  extractLinkFile: vi.fn(),
  splitSubpath: vi.fn(),
  testEmbed: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn(),
  getCacheSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  copySafe: vi.fn(),
  createFolderSafe: vi.fn(),
  deleteEmptyFolderHierarchy: vi.fn(),
  getAvailablePath: vi.fn(),
  listSafe: vi.fn(),
  renameSafe: vi.fn(),
  trashSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault-delete', () => ({
  deleteIfNotUsed: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { FilesHandler } from './files-handler.ts';

interface FilesHandlerPrivate {
  createFolderForAttachmentFromPath(filePath: string): Promise<void>;
  deleteFile(file: TFile): Promise<void>;
  moveAttachment(file: TFile, newLinkPath: string, parentNotePaths: string[]): Promise<MovedAttachmentResultLike>;
}

interface MovedAttachmentLike {
  newPath: string;
  oldPath: string;
}

interface MovedAttachmentResultLike {
  movedAttachments: MovedAttachmentLike[];
}

interface ParentLike {
  path: string;
}

interface SettingsLike {
  collectAttachmentUsedByMultipleNotesMode?: string;
  emptyFolderBehavior: string;
  isExcludedFromAttachmentCollecting(path: string): boolean;
  isPathIgnored(path: string): boolean;
  shouldDeleteExistingFilesWhenMovingNote: boolean;
  treatAsAttachmentExtensions: string[];
}

const mockGetAttachmentFilePath = vi.mocked(getAttachmentFilePath);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockGetPath = vi.mocked(getPath);
const mockIsNote = vi.mocked(isNote);
const mockExtractLinkFile = vi.mocked(extractLinkFile);
const mockSplitSubpath = vi.mocked(splitSubpath);
const mockTestEmbed = vi.mocked(testEmbed);
const mockGetAllLinks = vi.mocked(getAllLinks);
const mockGetCacheSafe = vi.mocked(getCacheSafe);
const mockCopySafe = vi.mocked(copySafe);
const mockCreateFolderSafe = vi.mocked(createFolderSafe);
const mockDeleteEmptyFolderHierarchy = vi.mocked(deleteEmptyFolderHierarchy);
const mockGetAvailablePath = vi.mocked(getAvailablePath);
const mockListSafe = vi.mocked(listSafe);
const mockRenameSafe = vi.mocked(renameSafe);
const mockTrashSafe = vi.mocked(trashSafe);
const mockDeleteIfNotUsed = vi.mocked(deleteIfNotUsed);

function asPrivate(handler: FilesHandler): FilesHandlerPrivate {
  return castTo<FilesHandlerPrivate>(handler);
}

function createFile(path: string, parent: null | ParentLike = null): TFile {
  return strictProxy<TFile>({
    parent: parent === null ? null : strictProxy<TFile['parent']>(parent),
    path
  });
}

describe('FilesHandler', () => {
  let app: App;
  let exists: ReturnType<typeof vi.fn<(path: string, isCaseSensitive?: boolean) => Promise<boolean>>>;
  let adapterExists: ReturnType<typeof vi.fn<(normalizedPath: string, sensitive?: boolean) => Promise<boolean>>>;
  let rmdir: ReturnType<typeof vi.fn<(normalizedPath: string, recursive: boolean) => Promise<void>>>;
  let getCachedNotesThatHaveLinkToFile: ReturnType<typeof vi.fn<(path: string) => Promise<string[]>>>;
  let getFullPathForLink: ReturnType<typeof vi.fn<(link: string, owningNotePath: string) => string>>;
  let handler: FilesHandler;
  let lh: LinksHandler;
  let pluginSettingsComponent: PluginSettingsComponent;
  let settings: SettingsLike;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.clearAllMocks();

    settings = {
      emptyFolderBehavior: EmptyFolderBehavior.Keep,
      isExcludedFromAttachmentCollecting: vi.fn().mockReturnValue(false),
      isPathIgnored: vi.fn().mockReturnValue(false),
      shouldDeleteExistingFilesWhenMovingNote: false,
      treatAsAttachmentExtensions: []
    };

    exists = vi.fn<(path: string, isCaseSensitive?: boolean) => Promise<boolean>>().mockResolvedValue(true);
    adapterExists = vi.fn<(normalizedPath: string, sensitive?: boolean) => Promise<boolean>>().mockResolvedValue(false);
    rmdir = vi.fn<(normalizedPath: string, recursive: boolean) => Promise<void>>().mockResolvedValue(undefined);

    app = strictProxy<App>({
      vault: strictProxy<App['vault']>({
        adapter: strictProxy<App['vault']['adapter']>({
          exists: adapterExists,
          rmdir
        }),
        exists
      })
    });

    pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
      settings: castTo<PluginSettingsComponent['settings']>(settings)
    });

    getCachedNotesThatHaveLinkToFile = vi.fn<(path: string) => Promise<string[]>>().mockResolvedValue([]);
    getFullPathForLink = vi.fn<(link: string, owningNotePath: string) => string>().mockReturnValue('full/path');
    lh = strictProxy<LinksHandler>({
      getCachedNotesThatHaveLinkToFile,
      getFullPathForLink
    });

    handler = new FilesHandler({
      app,
      linksHandler: lh,
      pluginSettingsComponent
    });

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('isNoteEx', () => {
    it('should return false when pathOrFile is null', () => {
      expect(handler.isNoteEx(null)).toBe(false);
      expect(mockIsNote).not.toHaveBeenCalled();
    });

    it('should return false when not a note', () => {
      mockIsNote.mockReturnValue(false);
      expect(handler.isNoteEx('foo.png')).toBe(false);
    });

    it('should return true when a note and extension is not treated as attachment', () => {
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('note.md');
      settings.treatAsAttachmentExtensions = ['.excalidraw.md'];
      expect(handler.isNoteEx('note.md')).toBe(true);
    });

    it('should return false when path ends with a treated-as-attachment extension', () => {
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('drawing.excalidraw.md');
      settings.treatAsAttachmentExtensions = ['.excalidraw.md'];
      expect(handler.isNoteEx('drawing.excalidraw.md')).toBe(false);
    });
  });

  describe('deleteEmptyFolders', () => {
    it('should return early when the path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      await handler.deleteEmptyFolders('ignored');
      expect(mockListSafe).not.toHaveBeenCalled();
    });

    it('should recurse into subfolders and remove empty folder', async () => {
      mockListSafe
        .mockResolvedValueOnce({ files: [], folders: ['parent/child'] })
        .mockResolvedValueOnce({ files: [], folders: [] })
        .mockResolvedValueOnce({ files: [], folders: [] })
        .mockResolvedValueOnce({ files: [], folders: [] });
      await handler.deleteEmptyFolders('./parent');
      expect(rmdir).toHaveBeenCalledWith('parent', false);
      expect(rmdir).toHaveBeenCalledWith('parent/child', false);
    });

    it('should not rmdir when folder still has files', async () => {
      mockListSafe
        .mockResolvedValueOnce({ files: ['parent/file.md'], folders: [] })
        .mockResolvedValueOnce({ files: ['parent/file.md'], folders: [] });
      await handler.deleteEmptyFolders('parent');
      expect(rmdir).not.toHaveBeenCalled();
    });

    it('should not rmdir when the folder does not exist', async () => {
      mockListSafe.mockResolvedValue({ files: [], folders: [] });
      exists.mockResolvedValue(false);
      await handler.deleteEmptyFolders('parent');
      expect(rmdir).not.toHaveBeenCalled();
    });

    it('should swallow rmdir error when folder no longer exists', async () => {
      mockListSafe.mockResolvedValue({ files: [], folders: [] });
      rmdir.mockRejectedValue(new Error('boom'));
      adapterExists.mockResolvedValue(false);
      await expect(handler.deleteEmptyFolders('parent')).resolves.toBeUndefined();
      expect(adapterExists).toHaveBeenCalledWith('parent');
    });

    it('should rethrow rmdir error when folder still exists', async () => {
      mockListSafe.mockResolvedValue({ files: [], folders: [] });
      const error = new Error('boom');
      rmdir.mockRejectedValue(error);
      adapterExists.mockResolvedValue(true);
      await expect(handler.deleteEmptyFolders('parent')).rejects.toBe(error);
    });
  });

  describe('collectAttachmentsForCachedNote', () => {
    it('should return empty result when the note path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      const result = await handler.collectAttachmentsForCachedNote('ignored.md');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should return empty result when there is no cache', async () => {
      mockGetCacheSafe.mockResolvedValue(null);
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should skip links without a linkPath', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: '#heading', original: '[[#heading]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: '', subpath: '#heading' });
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should skip duplicates already in movedAttachments', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      const link = castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '![[img.png]]' });
      mockGetAllLinks.mockReturnValue([link, link]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      getFullPathForLink.mockReturnValue('dir/img.png');
      const file = createFile('dir/img.png');
      mockExtractLinkFile.mockReturnValue(file);
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toHaveLength(1);
    });

    it('should warn when a link file does not exist (embed)', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '![[img.png]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(null);
      mockTestEmbed.mockReturnValue(true);
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bad embed'));
      expect(result.movedAttachments).toEqual([]);
    });

    it('should warn when a link file does not exist (link)', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '[[img.png]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(null);
      mockTestEmbed.mockReturnValue(false);
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bad link'));
      expect(result.movedAttachments).toEqual([]);
    });

    it('should skip when the linked file is a note', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'other.md', original: '[[other.md]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '' });
      const file = createFile('other.md');
      mockExtractLinkFile.mockReturnValue(file);
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('other.md');
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should skip when the file is excluded from attachment collecting', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '![[img.png]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      const file = createFile('img.png');
      mockExtractLinkFile.mockReturnValue(file);
      mockIsNote.mockReturnValue(false);
      castTo<ReturnType<typeof vi.fn>>(settings.isExcludedFromAttachmentCollecting).mockReturnValue(true);
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should skip when the new directory equals the old directory', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '![[img.png]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      const file = createFile('dir/img.png');
      mockExtractLinkFile.mockReturnValue(file);
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('dir/img2.png');
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([]);
      expect(mockRenameSafe).not.toHaveBeenCalled();
    });

    it('should move the attachment and accumulate results', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([castTo<ReturnType<typeof getAllLinks>[number]>({ link: 'img.png', original: '![[img.png]]' })]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      const file = createFile('dir/img.png');
      mockExtractLinkFile.mockReturnValue(file);
      mockIsNote.mockReturnValue(false);
      mockGetAttachmentFilePath.mockResolvedValue('attachments/img.png');
      mockGetFileOrNull.mockReturnValue(null);
      getCachedNotesThatHaveLinkToFile.mockResolvedValue([]);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      const result = await handler.collectAttachmentsForCachedNote('note.md');
      expect(result.movedAttachments).toEqual([{ newPath: 'attachments/img.png', oldPath: 'dir/img.png' }]);
      expect(mockRenameSafe).toHaveBeenCalledWith(app, file, 'attachments/img.png');
    });
  });

  describe('createFolderForAttachmentFromPath', () => {
    it('should create the parent folder', async () => {
      await asPrivate(handler).createFolderForAttachmentFromPath('a/b/c.png');
      expect(mockCreateFolderSafe).toHaveBeenCalledWith(app, 'a/b');
    });
  });

  describe('deleteFile', () => {
    it('should trash the file and return when there is no parent', async () => {
      const file = createFile('img.png');
      await asPrivate(handler).deleteFile(file);
      expect(mockTrashSafe).toHaveBeenCalledWith(app, file);
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
    });

    it('should call deleteIfNotUsed when behavior is Delete', async () => {
      settings.emptyFolderBehavior = EmptyFolderBehavior.Delete;
      const parent = { path: 'dir' };
      const file = createFile('dir/img.png', parent);
      await asPrivate(handler).deleteFile(file);
      expect(mockDeleteIfNotUsed).toHaveBeenCalledWith(app, file.parent, undefined, undefined, true);
    });

    it('should call deleteEmptyFolderHierarchy when behavior is DeleteWithEmptyParents', async () => {
      settings.emptyFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
      const file = createFile('dir/img.png', { path: 'dir' });
      await asPrivate(handler).deleteFile(file);
      expect(mockDeleteEmptyFolderHierarchy).toHaveBeenCalledWith(app, file.parent);
    });

    it('should do nothing extra when behavior is Keep', async () => {
      settings.emptyFolderBehavior = EmptyFolderBehavior.Keep;
      const file = createFile('dir/img.png', { path: 'dir' });
      await asPrivate(handler).deleteFile(file);
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
      expect(mockDeleteEmptyFolderHierarchy).not.toHaveBeenCalled();
    });
  });

  describe('moveAttachment', () => {
    it('should return empty result when the path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      const file = createFile('img.png');
      const result = await asPrivate(handler).moveAttachment(file, 'new.png', []);
      expect(result.movedAttachments).toEqual([]);
    });

    it('should return empty result when the file is a note', async () => {
      mockIsNote.mockReturnValue(true);
      mockGetPath.mockReturnValue('note.md');
      const file = createFile('note.md');
      const result = await asPrivate(handler).moveAttachment(file, 'new.md', []);
      expect(result.movedAttachments).toEqual([]);
    });

    it('should warn and return when source equals destination', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('img.png');
      const result = await asPrivate(handler).moveAttachment(file, 'img.png', []);
      expect(warnSpy).toHaveBeenCalledWith('Can\'t move file. Source and destination path the same.');
      expect(result.movedAttachments).toEqual([]);
    });

    it('should rename when there are no linked notes (isMove)', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('dir/img.png', { path: 'dir' });
      getCachedNotesThatHaveLinkToFile.mockResolvedValue([]);
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      const result = await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockRenameSafe).toHaveBeenCalledWith(app, file, 'attachments/img.png');
      expect(result.movedAttachments).toEqual([{ newPath: 'attachments/img.png', oldPath: 'dir/img.png' }]);
    });

    it('should copy when there are remaining linked notes', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('img.png');
      getCachedNotesThatHaveLinkToFile.mockResolvedValue(['other.md']);
      mockGetFileOrNull.mockReturnValue(null);
      const result = await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockCopySafe).toHaveBeenCalledWith(app, file, 'attachments/img.png');
      expect(result.movedAttachments).toHaveLength(1);
    });

    it('should remove parent note paths from the linked notes', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('img.png');
      getCachedNotesThatHaveLinkToFile.mockResolvedValue(['note.md']);
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      const result = await asPrivate(handler).moveAttachment(file, 'attachments/img.png', ['note.md']);
      expect(mockRenameSafe).toHaveBeenCalled();
      expect(result.movedAttachments).toHaveLength(1);
    });

    it('should delete the existing destination file when shouldDeleteExistingFilesWhenMovingNote is true', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('img.png');
      const existing = createFile('attachments/img.png');
      mockGetFileOrNull.mockReturnValue(existing);
      settings.shouldDeleteExistingFilesWhenMovingNote = true;
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockTrashSafe).toHaveBeenCalledWith(app, existing);
    });

    it('should get an available path when the destination exists and not deleting', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('img.png');
      const existing = createFile('attachments/img.png');
      mockGetFileOrNull.mockReturnValue(existing);
      settings.shouldDeleteExistingFilesWhenMovingNote = false;
      mockGetAvailablePath.mockReturnValue('attachments/img-1.png');
      mockRenameSafe.mockResolvedValue('attachments/img-1.png');
      const result = await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockGetAvailablePath).toHaveBeenCalledWith(app, 'attachments/img.png');
      expect(result.movedAttachments).toEqual([{ newPath: 'attachments/img-1.png', oldPath: 'img.png' }]);
    });

    it('should delete the old folder when behavior is Delete', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('dir/img.png', { path: 'dir' });
      settings.emptyFolderBehavior = EmptyFolderBehavior.Delete;
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockDeleteIfNotUsed).toHaveBeenCalledWith(app, file.parent, undefined, undefined, true);
    });

    it('should delete the old folder hierarchy when behavior is DeleteWithEmptyParents', async () => {
      mockIsNote.mockReturnValue(false);
      const file = createFile('dir/img.png', { path: 'dir' });
      settings.emptyFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockDeleteEmptyFolderHierarchy).toHaveBeenCalledWith(app, file.parent);
    });

    it('should retry recursively when the file was moved already', async () => {
      mockIsNote.mockReturnValue(false);
      let currentPath = 'img.png';
      const file = strictProxy<TFile>({
        get parent() {
          return null;
        },
        get path() {
          return currentPath;
        }
      });
      let callCount = 0;
      getCachedNotesThatHaveLinkToFile.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Simulate the file being moved during the first await.
          currentPath = 'moved.png';
        }
        return Promise.resolve([]);
      });
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/moved.png');

      const result = await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(warnSpy).toHaveBeenCalledWith('File was moved already');
      expect(callCount).toBe(2);
      expect(result.movedAttachments).toEqual([{ newPath: 'attachments/img.png', oldPath: 'moved.png' }]);
    });

    it('should not touch the old folder when it is null', async () => {
      mockIsNote.mockReturnValue(false);
      settings.emptyFolderBehavior = EmptyFolderBehavior.Delete;
      const file = createFile('img.png', null);
      mockGetFileOrNull.mockReturnValue(null);
      mockRenameSafe.mockResolvedValue('attachments/img.png');
      await asPrivate(handler).moveAttachment(file, 'attachments/img.png', []);
      expect(mockDeleteIfNotUsed).not.toHaveBeenCalled();
    });
  });
});
