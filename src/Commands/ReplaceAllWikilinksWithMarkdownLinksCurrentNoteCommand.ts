import type { TFile } from 'obsidian';

import {
  FileCommandBase,
  FileCommandInvocationBase
} from 'obsidian-dev-utils/obsidian/Commands/FileCommandBase';

import type { Plugin } from '../Plugin.ts';

class ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandInvocation extends FileCommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, file: null | TFile) {
    super(plugin, file);
  }

  protected override async execute(): Promise<void> {
    this.plugin.replaceAllWikilinksWithMarkdownLinksCurrentNote(this.file);
    await Promise.resolve();
  }
}

export class ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommand extends FileCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'replace',
      id: 'replace-all-wikilinks-with-markdown-links-current-note',
      name: 'Replace all wikilinks with markdown links in current note',
      plugin
    });
  }

  protected override createCommandInvocationForFile(file: null | TFile): FileCommandInvocationBase<Plugin> {
    return new ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandInvocation(this.plugin, file);
  }
}
