import type { TAbstractFile } from 'obsidian';

import { AbstractFileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/abstract-file-command-handler';
import {
  isFile,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';

import type { Plugin } from '../plugin.ts';

import { collectAttachmentsInAbstractFiles } from '../attachment-collector.ts';

export class CollectAttachmentsInFileCommandHandler extends AbstractFileCommandHandler {
  public constructor(private readonly plugin: Plugin) {
    super({
      fileMenuItemName: 'Collect attachments in file',
      filesMenuItemName: 'Collect attachments in files',
      icon: 'download',
      id: 'collect-attachments-in-file',
      name: 'Collect attachments in current note'
    });
  }

  protected override canExecuteAbstractFile(abstractFile: TAbstractFile): boolean {
    return !isFile(abstractFile) || isNote(this.plugin.app, abstractFile);
  }

  protected override canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean {
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && !isNote(this.plugin.app, abstractFile)) {
        return false;
      }
    }
    return true;
  }

  protected override executeAbstractFile(abstractFile: TAbstractFile): void {
    collectAttachmentsInAbstractFiles(this.plugin, [abstractFile]);
  }

  protected override executeAbstractFiles(abstractFiles: TAbstractFile[]): void {
    collectAttachmentsInAbstractFiles(this.plugin, abstractFiles);
  }

  protected override shouldAddToAbstractFileMenu(): boolean {
    return true;
  }

  protected override shouldAddToAbstractFilesMenu(): boolean {
    return true;
  }
}
