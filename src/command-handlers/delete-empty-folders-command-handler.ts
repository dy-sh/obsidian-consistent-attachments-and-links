import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { Plugin } from '../plugin.ts';

export class DeleteEmptyFoldersCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'trash',
      id: 'delete-empty-folders',
      name: 'Delete empty folders'
    });
  }

  protected override async execute(): Promise<void> {
    await this.plugin.deleteEmptyFolders();
  }
}
