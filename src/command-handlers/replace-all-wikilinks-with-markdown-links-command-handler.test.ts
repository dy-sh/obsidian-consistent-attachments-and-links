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

import { ReplaceAllWikilinksWithMarkdownLinksCommandHandler } from './replace-all-wikilinks-with-markdown-links-command-handler.ts';

interface CommandHandlerPrivate {
  execute(): Promise<void>;
}

function asPrivate(handler: ReplaceAllWikilinksWithMarkdownLinksCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ReplaceAllWikilinksWithMarkdownLinksCommandHandler', () => {
  let handler: ReplaceAllWikilinksWithMarkdownLinksCommandHandler;
  let replaceAllWikilinksWithMarkdownLinks: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceAllWikilinksWithMarkdownLinks = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    handler = new ReplaceAllWikilinksWithMarkdownLinksCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      replaceAllWikilinksWithMarkdownLinks
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ReplaceAllWikilinksWithMarkdownLinksCommandHandler);
  });

  it('should call replaceAllWikilinksWithMarkdownLinks on execute', async () => {
    await asPrivate(handler).execute();
    expect(replaceAllWikilinksWithMarkdownLinks).toHaveBeenCalledOnce();
  });
});
