import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class ReorganizeVaultCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'sort-asc',
      id: 'reorganize-vault',
      name: 'Reorganize vault'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.reorganizeVault();
  }
}
