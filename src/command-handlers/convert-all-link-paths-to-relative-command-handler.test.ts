/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

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

vi.mock('obsidian-dev-utils/obsidian/command-handlers/global-command-handler', () => ({
  GlobalCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { ConvertAllLinkPathsToRelativeCommandHandler } from './convert-all-link-paths-to-relative-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: ConvertAllLinkPathsToRelativeCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ConvertAllLinkPathsToRelativeCommandHandler', () => {
  let abortSignal: AbortSignal;
  let convertAllLinkPathsToRelative: ReturnType<typeof vi.fn<(abortSignal: AbortSignal) => Promise<void>>>;
  let handler: ConvertAllLinkPathsToRelativeCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    abortSignal = new AbortController().signal;
    convertAllLinkPathsToRelative = vi.fn<(abortSignal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined);
    handler = new ConvertAllLinkPathsToRelativeCommandHandler({
      abortSignalComponent: strictProxy<AbortSignalComponent>({
        abortSignal
      }),
      consistentAttachmentsAndLinksComponent: strictProxy<ConsistentAttachmentsAndLinksComponent>({
        convertAllLinkPathsToRelative
      })
    });
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ConvertAllLinkPathsToRelativeCommandHandler);
  });

  it('should call convertAllLinkPathsToRelative with the abort signal on execute', async () => {
    await asPrivate(handler).execute();
    expect(convertAllLinkPathsToRelative).toHaveBeenCalledExactlyOnceWith(abortSignal);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
