import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class ReorganizeVaultCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.reorganizeVault();
  }
}

export class ReorganizeVaultCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'sort-asc',
      id: 'reorganize-vault',
      name: 'Reorganize vault',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new ReorganizeVaultCommandInvocation(this.plugin);
  }
}
