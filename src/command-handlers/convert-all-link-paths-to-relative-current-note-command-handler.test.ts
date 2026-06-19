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

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

vi.mock('obsidian-dev-utils/obsidian/command-handlers/file-command-handler', () => ({
  FileCommandHandler: class {
    public constructor(_params: unknown) {
      // Base no-op.
    }
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler } from './convert-all-link-paths-to-relative-current-note-command-handler.ts';

interface CommandHandlerPrivate {
  executeFile(file: TFile): void;
}

function asPrivate(handler: ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler): CommandHandlerPrivate {
  return castTo<CommandHandlerPrivate>(handler);
}

describe('ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler', () => {
  let convertAllLinkPathsToRelativeCurrentNote: ReturnType<typeof vi.fn<(file: TFile) => void>>;
  let handler: ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    convertAllLinkPathsToRelativeCurrentNote = vi.fn<(file: TFile) => void>();
    handler = new ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler(strictProxy<ConsistentAttachmentsAndLinksComponent>({
      convertAllLinkPathsToRelativeCurrentNote
    }));
  });

  it('should create an instance', () => {
    expect(handler).toBeInstanceOf(ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler);
  });

  it('should call convertAllLinkPathsToRelativeCurrentNote with the file on executeFile', () => {
    const file = strictProxy<TFile>({ path: 'note.md' });
    asPrivate(handler).executeFile(file);
    expect(convertAllLinkPathsToRelativeCurrentNote).toHaveBeenCalledExactlyOnceWith(file);
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
