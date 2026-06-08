/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import type { TFolder } from 'obsidian';

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

import { collectAttachmentsInAbstractFiles } from '../attachment-collector.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/folder-command-handler', () => ({
  FolderCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

vi.mock('../attachment-collector.ts', () => ({
  collectAttachmentsInAbstractFiles: vi.fn()
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
  let handler: CollectAttachmentsInCurrentFolderCommandHandler;
  let plugin: Plugin;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = strictProxy<Plugin>({});
    handler = new CollectAttachmentsInCurrentFolderCommandHandler(plugin);
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(CollectAttachmentsInCurrentFolderCommandHandler);
  });

  it('should call collectAttachmentsInAbstractFiles with the plugin and folder on executeFolder', () => {
    const folder = strictProxy<TFolder>({ path: 'my-folder' });
    asPrivate(handler).executeFolder(folder);
    expect(collectAttachmentsInAbstractFiles).toHaveBeenCalledExactlyOnceWith(plugin, [folder]);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
