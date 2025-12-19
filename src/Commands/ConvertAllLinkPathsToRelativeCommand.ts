import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/Commands/CommandBase';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/Commands/NonEditorCommandBase';

import type { Plugin } from '../Plugin.ts';

class ConvertAllLinkPathsToRelativeCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.convertAllLinkPathsToRelative(this.plugin.abortSignal);
  }
}

export class ConvertAllLinkPathsToRelativeCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'activity',
      id: 'convert-all-link-paths-to-relative',
      name: 'Convert all link paths to relative',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new ConvertAllLinkPathsToRelativeCommandInvocation(this.plugin);
  }
}
