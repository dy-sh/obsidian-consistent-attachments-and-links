import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class ConvertAllEmbedsPathsToRelativeCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-embed-paths-to-relative',
      name: 'Convert all embed paths to relative'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.convertAllEmbedsPathsToRelative();
  }
}
