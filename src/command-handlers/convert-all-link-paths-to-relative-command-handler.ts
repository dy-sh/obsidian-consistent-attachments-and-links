import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class ConvertAllLinkPathsToRelativeCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-link-paths-to-relative',
      name: 'Convert all link paths to relative'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.convertAllLinkPathsToRelative(this.plugin.abortSignal);
  }
}
