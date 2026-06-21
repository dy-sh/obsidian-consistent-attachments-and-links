import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

import { DeleteEmptyFoldersCommandHandler } from './delete-empty-folders-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: DeleteEmptyFoldersCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('DeleteEmptyFoldersCommandHandler', () => {
  let deleteEmptyFolders: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let handler: DeleteEmptyFoldersCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    deleteEmptyFolders = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new DeleteEmptyFoldersCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      deleteEmptyFolders
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(DeleteEmptyFoldersCommandHandler);
  });

  it('should call deleteEmptyFolders on execute', async () => {
    await asPrivate(handler).execute();
    expect(deleteEmptyFolders).toHaveBeenCalledOnce();
  });
});
