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

import type { AttachmentCollector } from '../attachment-collector.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/global-command-handler', () => ({
  GlobalCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { CollectAttachmentsEntireVaultCommandHandler } from './collect-attachments-entire-vault-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): void;
}

function asPrivate(handler: CollectAttachmentsEntireVaultCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('CollectAttachmentsEntireVaultCommandHandler', () => {
  let collectAttachmentsEntireVault: ReturnType<typeof vi.fn<() => void>>;
  let handler: CollectAttachmentsEntireVaultCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    collectAttachmentsEntireVault = vi.fn<() => void>();
    handler = new CollectAttachmentsEntireVaultCommandHandler(strictProxy<AttachmentCollector>({
      collectAttachmentsEntireVault
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(CollectAttachmentsEntireVaultCommandHandler);
  });

  it('should call collectAttachmentsEntireVault on execute', () => {
    asPrivate(handler).execute();
    expect(collectAttachmentsEntireVault).toHaveBeenCalledOnce();
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
