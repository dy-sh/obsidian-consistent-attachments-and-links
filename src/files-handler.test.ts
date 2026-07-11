import type { App } from 'obsidian';
import type { MockInstance } from 'vitest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import {
  getPath,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { listSafe } from 'obsidian-dev-utils/obsidian/vault';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

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
  getCacheSafe: vi.fn(),
  getLinks: vi.fn()
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

interface SettingsLike {
  collectAttachmentUsedByMultipleNotesMode?: string;
  emptyFolderBehavior: string;
  isExcludedFromAttachmentCollecting(path: string): boolean;
  isPathIgnored(path: string): boolean;
  shouldDeleteExistingFilesWhenMovingNote: boolean;
  treatAsAttachmentExtensions: string[];
}

const mockGetPath = vi.mocked(getPath);
const mockIsNote = vi.mocked(isNote);
const mockListSafe = vi.mocked(listSafe);

describe('FilesHandler', () => {
  let app: App;
  let exists: ReturnType<typeof vi.fn<(path: string, isCaseSensitive?: boolean) => Promise<boolean>>>;
  let adapterExists: ReturnType<typeof vi.fn<(normalizedPath: string, sensitive?: boolean) => Promise<boolean>>>;
  let rmdir: ReturnType<typeof vi.fn<(normalizedPath: string, recursive: boolean) => Promise<void>>>;
  let handler: FilesHandler;
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

    handler = new FilesHandler({
      app,
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
});
