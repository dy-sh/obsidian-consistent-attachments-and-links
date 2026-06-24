import type { TAbstractFile } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  isFile,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { AttachmentCollector } from '../attachment-collector.ts';

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  isFile: vi.fn(),
  isNote: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { CollectAttachmentsInFileCommandHandler } from './collect-attachments-in-file-command-handler.ts';

interface CommandHandlerPrivate {
  canExecuteAbstractFile(abstractFile: TAbstractFile): boolean;
  canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean;
  executeAbstractFile(abstractFile: TAbstractFile): void;
  executeAbstractFiles(abstractFiles: TAbstractFile[]): void;
  shouldAddToAbstractFileMenu(): boolean;
  shouldAddToAbstractFilesMenu(): boolean;
}

const mockIsFile = vi.mocked(isFile);
const mockIsNote = vi.mocked(isNote);

function asPrivate(handler: CollectAttachmentsInFileCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

function createAbstractFile(path: string): TAbstractFile {
  return strictProxy<TAbstractFile>({ path });
}

describe('CollectAttachmentsInFileCommandHandler', () => {
  let collectAttachmentsInAbstractFiles: ReturnType<typeof vi.fn<(abstractFiles: TAbstractFile[]) => void>>;
  let handler: CollectAttachmentsInFileCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    collectAttachmentsInAbstractFiles = vi.fn<(abstractFiles: TAbstractFile[]) => void>();
    handler = new CollectAttachmentsInFileCommandHandler({
      attachmentCollector: strictProxy<AttachmentCollector>({
        collectAttachmentsInAbstractFiles
      })
    });
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(CollectAttachmentsInFileCommandHandler);
  });

  describe('canExecuteAbstractFile', () => {
    it('should return true when the abstract file is not a file', () => {
      mockIsFile.mockReturnValue(false);
      expect(asPrivate(handler).canExecuteAbstractFile(createAbstractFile('folder'))).toBe(true);
      expect(mockIsNote).not.toHaveBeenCalled();
    });

    it('should return true when the file is a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(true);
      expect(asPrivate(handler).canExecuteAbstractFile(createAbstractFile('note.md'))).toBe(true);
    });

    it('should return false when the file is not a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(false);
      expect(asPrivate(handler).canExecuteAbstractFile(createAbstractFile('image.png'))).toBe(false);
    });
  });

  describe('canExecuteAbstractFiles', () => {
    it('should return true when all files are notes', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValue(true);
      const files = [createAbstractFile('a.md'), createAbstractFile('b.md')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(true);
    });

    it('should return false when a file is not a note', () => {
      mockIsFile.mockReturnValue(true);
      mockIsNote.mockReturnValueOnce(true).mockReturnValueOnce(false);
      const files = [createAbstractFile('a.md'), createAbstractFile('b.png')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(false);
    });

    it('should return true when none of the abstract files are files', () => {
      mockIsFile.mockReturnValue(false);
      const files = [createAbstractFile('folder1'), createAbstractFile('folder2')];
      expect(asPrivate(handler).canExecuteAbstractFiles(files)).toBe(true);
      expect(mockIsNote).not.toHaveBeenCalled();
    });
  });

  describe('executeAbstractFile', () => {
    it('should call collectAttachmentsInAbstractFiles with the single file wrapped in an array', () => {
      const file = createAbstractFile('note.md');
      asPrivate(handler).executeAbstractFile(file);
      expect(collectAttachmentsInAbstractFiles).toHaveBeenCalledExactlyOnceWith([file]);
    });
  });

  describe('executeAbstractFiles', () => {
    it('should call collectAttachmentsInAbstractFiles with all files', () => {
      const files = [createAbstractFile('a.md'), createAbstractFile('b.md')];
      asPrivate(handler).executeAbstractFiles(files);
      expect(collectAttachmentsInAbstractFiles).toHaveBeenCalledExactlyOnceWith(files);
    });
  });

  it('should add to the abstract file menu', () => {
    expect(asPrivate(handler).shouldAddToAbstractFileMenu()).toBe(true);
  });

  it('should add to the abstract files menu', () => {
    expect(asPrivate(handler).shouldAddToAbstractFilesMenu()).toBe(true);
  });
});
