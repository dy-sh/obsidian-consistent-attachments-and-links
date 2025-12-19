import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class CheckConsistencyCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.checkConsistency();
  }
}

export class CheckConsistencyCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'check',
      id: 'check-consistency',
      name: 'Check vault consistency',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new CheckConsistencyCommandInvocation(this.plugin);
  }
}
