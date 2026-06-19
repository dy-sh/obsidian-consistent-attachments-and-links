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

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/global-command-handler', () => ({
  GlobalCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
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
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
