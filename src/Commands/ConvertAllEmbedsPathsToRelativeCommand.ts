import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class ConvertAllEmbedsPathsToRelativeCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.convertAllEmbedsPathsToRelative();
  }
}

export class ConvertAllEmbedsPathsToRelativeCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-embed-paths-to-relative',
      name: 'Convert all embed paths to relative',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new ConvertAllEmbedsPathsToRelativeCommandInvocation(this.plugin);
  }
}
