import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';

import type { Plugin } from '../Plugin.ts';

class DeleteEmptyFoldersCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  protected override async execute(): Promise<void> {
    await this.plugin.deleteEmptyFolders();
  }
}

export class DeleteEmptyFoldersCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'trash',
      id: 'delete-empty-folders',
      name: 'Delete empty folders',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new DeleteEmptyFoldersCommandInvocation(this.plugin);
  }
}
