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
    handler = new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
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
