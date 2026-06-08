/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from '../plugin.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/global-command-handler', () => ({
  GlobalCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
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
    handler = new DeleteEmptyFoldersCommandHandler(strictProxy<Plugin>({
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
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
