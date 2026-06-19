import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class ReorganizeVaultCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'sort-asc',
      id: 'reorganize-vault',
      name: 'Reorganize vault'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.reorganizeVault();
  }
}
