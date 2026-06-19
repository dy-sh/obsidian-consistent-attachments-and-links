import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class CheckConsistencyCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'check',
      id: 'check-consistency',
      name: 'Check vault consistency'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.checkConsistency();
  }
}
