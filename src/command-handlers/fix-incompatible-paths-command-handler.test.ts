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

import { FixIncompatiblePathsCommandHandler } from './fix-incompatible-paths-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: FixIncompatiblePathsCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('FixIncompatiblePathsCommandHandler', () => {
  let fixIncompatiblePaths: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let handler: FixIncompatiblePathsCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    fixIncompatiblePaths = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new FixIncompatiblePathsCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      fixIncompatiblePaths
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(FixIncompatiblePathsCommandHandler);
  });

  it('should call fixIncompatiblePaths on execute', async () => {
    await asPrivate(handler).execute();
    expect(fixIncompatiblePaths).toHaveBeenCalledOnce();
  });
});
