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
