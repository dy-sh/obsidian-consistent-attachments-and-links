/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors. */
import type { TFile } from 'obsidian';

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

vi.mock('obsidian-dev-utils/obsidian/command-handlers/file-command-handler', () => ({
  FileCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler } from './replace-all-wikilinks-with-markdown-links-current-note-command-handler.ts';

interface CommandHandlerPrivate {
  executeFile(file: TFile): void;
}

function asPrivate(handler: ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler', () => {
  let handler: ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler;
  let replaceAllWikilinksWithMarkdownLinksCurrentNote: ReturnType<typeof vi.fn<(file: TFile) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceAllWikilinksWithMarkdownLinksCurrentNote = vi.fn<(file: TFile) => void>();
    handler = new ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler(strictProxy<Plugin>({
      replaceAllWikilinksWithMarkdownLinksCurrentNote
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler);
  });

  it('should call replaceAllWikilinksWithMarkdownLinksCurrentNote with the file on executeFile', () => {
    const file = strictProxy<TFile>({ path: 'note.md' });
    asPrivate(handler).executeFile(file);
    expect(replaceAllWikilinksWithMarkdownLinksCurrentNote).toHaveBeenCalledExactlyOnceWith(file);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
