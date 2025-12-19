import type { TFile } from 'obsidian';

import {
  FileCommandBase,
  FileCommandInvocationBase
} from 'obsidian-dev-utils/obsidian/Commands/FileCommandBase';

import type { Plugin } from '../Plugin.ts';

class ConvertAllLinkPathsToRelativeCurrentNoteCommandInvocation extends FileCommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, file: null | TFile) {
    super(plugin, file);
  }

  protected override async execute(): Promise<void> {
    this.plugin.convertAllLinkPathsToRelativeCurrentNote(this.file);
    await Promise.resolve();
  }
}

export class ConvertAllLinkPathsToRelativeCurrentNoteCommand extends FileCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-link-paths-to-relative-current-note',
      name: 'Convert all link paths to relative in current note',
      plugin
    });
  }

  protected override createCommandInvocationForFile(file: null | TFile): FileCommandInvocationBase<Plugin> {
    return new ConvertAllLinkPathsToRelativeCurrentNoteCommandInvocation(this.plugin, file);
  }
}
