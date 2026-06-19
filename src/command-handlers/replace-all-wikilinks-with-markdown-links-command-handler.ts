import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class ReplaceAllWikilinksWithMarkdownLinksCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'replace',
      id: 'replace-all-wikilinks-with-markdown-links',
      name: 'Replace all wikilinks with markdown links'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.replaceAllWikilinksWithMarkdownLinks();
  }
}
