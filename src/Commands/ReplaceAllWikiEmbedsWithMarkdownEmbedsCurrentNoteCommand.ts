import type { TFile } from 'obsidian';

import {
  FileCommandBase,
  FileCommandInvocationBase
} from 'obsidian-dev-utils/obsidian/Commands/FileCommandBase';

import type { Plugin } from '../Plugin.ts';

class ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandInvocation extends FileCommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, file: null | TFile) {
    super(plugin, file);
  }

  protected override async execute(): Promise<void> {
    this.plugin.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(this.file);
    await Promise.resolve();
  }
}

export class ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommand extends FileCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'replace',
      id: 'replace-all-wiki-embeds-with-markdown-embeds-current-note',
      name: 'Replace all wiki embeds with Markdown embeds in current note',
      plugin
    });
  }

  protected override createCommandInvocationForFile(file: null | TFile): FileCommandInvocationBase<Plugin> {
    return new ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandInvocation(this.plugin, file);
  }
}
