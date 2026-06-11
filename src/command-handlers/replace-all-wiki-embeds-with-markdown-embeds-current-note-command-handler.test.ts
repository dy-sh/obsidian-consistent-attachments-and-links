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
import { ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler } from './replace-all-wiki-embeds-with-markdown-embeds-current-note-command-handler.ts';

interface CommandHandlerPrivate {
  executeFile(file: TFile): void;
}

function asPrivate(handler: ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler', () => {
  let handler: ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler;
  let replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote: ReturnType<typeof vi.fn<(file: TFile) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote = vi.fn<(file: TFile) => void>();
    handler = new ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler(strictProxy<Plugin>({
      replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler);
  });

  it('should call replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote with the file on executeFile', () => {
    const file = strictProxy<TFile>({ path: 'note.md' });
    asPrivate(handler).executeFile(file);
    expect(replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote).toHaveBeenCalledExactlyOnceWith(file);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
