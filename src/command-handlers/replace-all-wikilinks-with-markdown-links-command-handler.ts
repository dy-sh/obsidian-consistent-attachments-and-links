import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class ReplaceAllWikilinksWithMarkdownLinksCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'replace',
      id: 'replace-all-wikilinks-with-markdown-links',
      name: 'Replace all wikilinks with markdown links'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.replaceAllWikilinksWithMarkdownLinks();
  }
}
