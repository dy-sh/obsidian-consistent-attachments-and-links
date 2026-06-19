import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { AttachmentCollector } from '../attachment-collector.ts';

export class CollectAttachmentsEntireVaultCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly attachmentCollector: AttachmentCollector) {
    super({
      icon: 'download',
      id: 'collect-attachments-entire-vault',
      name: 'Collect attachments in entire vault'
    });
  }

  protected override execute(): void {
    this.attachmentCollector.collectAttachmentsEntireVault();
  }
}
