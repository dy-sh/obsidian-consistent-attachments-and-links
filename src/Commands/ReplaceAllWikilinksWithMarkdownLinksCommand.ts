import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class ReplaceAllWikilinksWithMarkdownLinksCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.replaceAllWikilinksWithMarkdownLinks();
  }
}

export class ReplaceAllWikilinksWithMarkdownLinksCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'replace',
      id: 'replace-all-wikilinks-with-markdown-links',
      name: 'Replace all wikilinks with markdown links',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new ReplaceAllWikilinksWithMarkdownLinksCommandInvocation(this.plugin);
  }
}
