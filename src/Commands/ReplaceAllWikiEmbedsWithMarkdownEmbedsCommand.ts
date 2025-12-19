import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.replaceAllWikiEmbedsWithMarkdownEmbeds();
  }
}

export class ReplaceAllWikiEmbedsWithMarkdownEmbedsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'replace',
      id: 'replace-all-wiki-embeds-with-markdown-embeds',
      name: 'Replace all wiki embeds with Markdown embeds',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandInvocation(this.plugin);
  }
}
