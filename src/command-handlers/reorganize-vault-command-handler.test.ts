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
    handler = new ReorganizeVaultCommandHandler(strictProxy<Plugin>({
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
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
