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

import { CheckConsistencyCommandHandler } from './check-consistency-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: CheckConsistencyCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('CheckConsistencyCommandHandler', () => {
  let checkConsistency: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let handler: CheckConsistencyCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    checkConsistency = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new CheckConsistencyCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      checkConsistency
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(CheckConsistencyCommandHandler);
  });

  it('should call checkConsistency on execute', async () => {
    await asPrivate(handler).execute();
    expect(checkConsistency).toHaveBeenCalledOnce();
  });
});
