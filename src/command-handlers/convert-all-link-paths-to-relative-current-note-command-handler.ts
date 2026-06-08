import type { TFile } from 'obsidian';

import { FileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/file-command-handler';

import type { Plugin } from '../plugin.ts';

export class ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler extends FileCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-link-paths-to-relative-current-note',
      name: 'Convert all link paths to relative in current note'
    });
  }

  protected override executeFile(file: TFile): void {
    this.plugin.convertAllLinkPathsToRelativeCurrentNote(file);
  }
}
