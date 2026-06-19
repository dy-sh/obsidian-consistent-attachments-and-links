import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class DeleteEmptyFoldersCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'trash',
      id: 'delete-empty-folders',
      name: 'Delete empty folders'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.deleteEmptyFolders();
  }
}
