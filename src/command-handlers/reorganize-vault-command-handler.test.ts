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

import { ReorganizeVaultCommandHandler } from './reorganize-vault-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: ReorganizeVaultCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ReorganizeVaultCommandHandler', () => {
  let handler: ReorganizeVaultCommandHandler;
  let reorganizeVault: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    reorganizeVault = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new ReorganizeVaultCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      reorganizeVault
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ReorganizeVaultCommandHandler);
  });

  it('should call reorganizeVault on execute', async () => {
    await asPrivate(handler).execute();
    expect(reorganizeVault).toHaveBeenCalledOnce();
  });
});
