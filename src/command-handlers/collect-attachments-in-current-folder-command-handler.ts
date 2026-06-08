import type { TFolder } from 'obsidian';

import { FolderCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/folder-command-handler';

import type { Plugin } from '../plugin.ts';

import { collectAttachmentsInAbstractFiles } from '../attachment-collector.ts';

export class CollectAttachmentsInCurrentFolderCommandHandler extends FolderCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      icon: 'download',
      id: 'collect-attachments-in-current-folder',
      name: 'Collect attachments in current folder'
    });
  }

  protected override executeFolder(folder: TFolder): void {
    collectAttachmentsInAbstractFiles(this.plugin, [folder]);
  }
}
