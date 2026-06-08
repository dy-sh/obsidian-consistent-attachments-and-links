import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class CheckConsistencyCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'check',
      id: 'check-consistency',
      name: 'Check vault consistency'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.checkConsistency();
  }
}
