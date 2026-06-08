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
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler } from './replace-all-wiki-embeds-with-markdown-embeds-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler', () => {
  let handler: ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler;
  let replaceAllWikiEmbedsWithMarkdownEmbeds: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceAllWikiEmbedsWithMarkdownEmbeds = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler(strictProxy<Plugin>({
      replaceAllWikiEmbedsWithMarkdownEmbeds
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler);
  });

  it('should call replaceAllWikiEmbedsWithMarkdownEmbeds on execute', async () => {
    await asPrivate(handler).execute();
    expect(replaceAllWikiEmbedsWithMarkdownEmbeds).toHaveBeenCalledOnce();
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
