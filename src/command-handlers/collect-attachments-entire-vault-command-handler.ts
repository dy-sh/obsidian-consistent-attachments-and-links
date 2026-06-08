import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

import { collectAttachmentsEntireVault } from '../attachment-collector.ts';

export class CollectAttachmentsEntireVaultCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'download',
      id: 'collect-attachments-entire-vault',
      name: 'Collect attachments in entire vault'
    });
  }

  protected override execute(): void {
    collectAttachmentsEntireVault(this.plugin);
  }
}
