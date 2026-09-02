import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

export class FixIncompatiblePathsCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent) {
    super({
      icon: 'wrench',
      id: 'fix-incompatible-paths',
      name: 'Fix incompatible paths'
    });
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.fixIncompatiblePaths();
  }
}
