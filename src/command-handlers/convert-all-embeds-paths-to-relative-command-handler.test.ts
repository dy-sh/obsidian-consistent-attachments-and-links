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

import { ConvertAllEmbedsPathsToRelativeCommandHandler } from './convert-all-embeds-paths-to-relative-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: ConvertAllEmbedsPathsToRelativeCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ConvertAllEmbedsPathsToRelativeCommandHandler', () => {
  let convertAllEmbedsPathsToRelative: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let handler: ConvertAllEmbedsPathsToRelativeCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    convertAllEmbedsPathsToRelative = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new ConvertAllEmbedsPathsToRelativeCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      convertAllEmbedsPathsToRelative
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ConvertAllEmbedsPathsToRelativeCommandHandler);
  });

  it('should call convertAllEmbedsPathsToRelative on execute', async () => {
    await asPrivate(handler).execute();
    expect(convertAllEmbedsPathsToRelative).toHaveBeenCalledOnce();
  });
});
