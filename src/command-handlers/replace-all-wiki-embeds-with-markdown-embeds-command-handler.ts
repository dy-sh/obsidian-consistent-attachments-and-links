import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'replace',
      id: 'replace-all-wiki-embeds-with-markdown-embeds',
      name: 'Replace all wiki embeds with Markdown embeds'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.replaceAllWikiEmbedsWithMarkdownEmbeds();
  }
}
