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
