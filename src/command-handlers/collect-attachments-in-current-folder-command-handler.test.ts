/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import type {
  TAbstractFile,
  TFolder
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { AttachmentCollector } from '../attachment-collector.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/folder-command-handler', () => ({
  FolderCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { CollectAttachmentsInCurrentFolderCommandHandler } from './collect-attachments-in-current-folder-command-handler.ts';

interface CommandHandlerPrivate {
  executeFolder(folder: TFolder): void;
}

function asPrivate(handler: CollectAttachmentsInCurrentFolderCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('CollectAttachmentsInCurrentFolderCommandHandler', () => {
  let collectAttachmentsInAbstractFiles: ReturnType<typeof vi.fn<(abstractFiles: TAbstractFile[]) => void>>;
  let handler: CollectAttachmentsInCurrentFolderCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    collectAttachmentsInAbstractFiles = vi.fn<(abstractFiles: TAbstractFile[]) => void>();
    handler = new CollectAttachmentsInCurrentFolderCommandHandler(strictProxy<AttachmentCollector>({
      collectAttachmentsInAbstractFiles
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(CollectAttachmentsInCurrentFolderCommandHandler);
  });

  it('should call collectAttachmentsInAbstractFiles with the folder on executeFolder', () => {
    const folder = strictProxy<TFolder>({ path: 'my-folder' });
    asPrivate(handler).executeFolder(folder);
    expect(collectAttachmentsInAbstractFiles).toHaveBeenCalledExactlyOnceWith([folder]);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
