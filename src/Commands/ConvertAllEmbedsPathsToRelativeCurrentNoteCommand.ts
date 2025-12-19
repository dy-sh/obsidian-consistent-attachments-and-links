import type { TFile } from 'obsidian';

import {
  FileCommandBase,
  FileCommandInvocationBase
} from 'obsidian-dev-utils/obsidian/Commands/FileCommandBase';

import type { Plugin } from '../Plugin.ts';

class ConvertAllEmbedsPathsToRelativeCurrentNoteCommandInvocation extends FileCommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, file: null | TFile) {
    super(plugin, file);
  }

  protected override async execute(): Promise<void> {
    this.plugin.convertAllEmbedsPathsToRelativeCurrentNote(this.file);
    await Promise.resolve();
  }
}

export class ConvertAllEmbedsPathsToRelativeCurrentNoteCommand extends FileCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-embed-paths-to-relative-current-note',
      name: 'Convert all embed paths to relative in current note',
      plugin
    });
  }

  protected override createCommandInvocationForFile(file: null | TFile): FileCommandInvocationBase<Plugin> {
    return new ConvertAllEmbedsPathsToRelativeCurrentNoteCommandInvocation(this.plugin, file);
  }
}
