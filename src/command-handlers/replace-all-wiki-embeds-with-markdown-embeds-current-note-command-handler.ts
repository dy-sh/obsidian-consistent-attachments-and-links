import type { TFile } from 'obsidian';

import { FileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/file-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler extends FileCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'replace',
      id: 'replace-all-wiki-embeds-with-markdown-embeds-current-note',
      name: 'Replace all wiki embeds with Markdown embeds in current note'
    });
  }

  protected override executeFile(file: TFile): void {
    this.consistentAttachmentsAndLinksComponent.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(file);
  }
}
