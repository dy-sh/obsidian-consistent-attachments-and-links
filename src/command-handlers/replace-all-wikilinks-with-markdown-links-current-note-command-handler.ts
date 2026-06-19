import type { TFile } from 'obsidian';

import { FileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/file-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler extends FileCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'replace',
      id: 'replace-all-wikilinks-with-markdown-links-current-note',
      name: 'Replace all wikilinks with markdown links in current note'
    });
  }

  protected override executeFile(file: TFile): void {
    this.consistentAttachmentsAndLinksComponent.replaceAllWikilinksWithMarkdownLinksCurrentNote(file);
  }
}
