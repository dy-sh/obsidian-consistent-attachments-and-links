import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { ConsistentAttachmentsAndLinksComponent } from '../consistent-attachments-and-links-component.ts';

interface ConvertAllLinkPathsToRelativeCommandHandlerConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent;
}

export class ConvertAllLinkPathsToRelativeCommandHandler extends GlobalCommandHandler {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly consistentAttachmentsAndLinksComponent: ConsistentAttachmentsAndLinksComponent;

  public constructor(params: ConvertAllLinkPathsToRelativeCommandHandlerConstructorParams) {
    super({
      icon: 'activity',
      id: 'convert-all-link-paths-to-relative',
      name: 'Convert all link paths to relative'
    });

    this.consistentAttachmentsAndLinksComponent = params.consistentAttachmentsAndLinksComponent;
    this.abortSignalComponent = params.abortSignalComponent;
  }

  protected override async execute(): Promise<void> {
    await this.consistentAttachmentsAndLinksComponent.convertAllLinkPathsToRelative(this.abortSignalComponent.abortSignal);
  }
}
