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

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

import { ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler } from './convert-all-embeds-paths-to-relative-current-note-command-handler.ts';

interface CommandHandlerPrivate {
  executeFile(file: TFile): void;
}

function asPrivate(handler: ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler', () => {
  let convertAllEmbedsPathsToRelativeCurrentNote: ReturnType<typeof vi.fn<(file: TFile) => void>>;
  let handler: ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    convertAllEmbedsPathsToRelativeCurrentNote = vi.fn<(file: TFile) => void>();
    handler = new ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      convertAllEmbedsPathsToRelativeCurrentNote
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler);
  });

  it('should call convertAllEmbedsPathsToRelativeCurrentNote with the file on executeFile', () => {
    const file = strictProxy<TFile>({ path: 'note.md' });
    asPrivate(handler).executeFile(file);
    expect(convertAllEmbedsPathsToRelativeCurrentNote).toHaveBeenCalledExactlyOnceWith(file);
  });
});
