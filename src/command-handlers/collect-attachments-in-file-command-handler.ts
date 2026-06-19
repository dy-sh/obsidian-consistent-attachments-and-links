import type {
  App,
  TAbstractFile
} from 'obsidian';

import { AbstractFileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/abstract-file-command-handler';
import {
  isFile,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';

import type { AttachmentCollector } from '../attachment-collector.ts';

interface CollectAttachmentsInFileCommandHandlerConstructorParams {
  readonly app: App;
  readonly attachmentCollector: AttachmentCollector;
}

export class CollectAttachmentsInFileCommandHandler extends AbstractFileCommandHandler {
  private readonly app: App;
  private readonly attachmentCollector: AttachmentCollector;

  public constructor(params: CollectAttachmentsInFileCommandHandlerConstructorParams) {
    super({
      fileMenuItemName: 'Collect attachments in file',
      filesMenuItemName: 'Collect attachments in files',
      icon: 'download',
      id: 'collect-attachments-in-file',
      name: 'Collect attachments in current note'
    });

    this.app = params.app;
    this.attachmentCollector = params.attachmentCollector;
  }

  protected override canExecuteAbstractFile(abstractFile: TAbstractFile): boolean {
    return !isFile(abstractFile) || isNote(this.app, abstractFile);
  }

  protected override canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean {
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && !isNote(this.app, abstractFile)) {
        return false;
      }
    }
    return true;
  }

  protected override executeAbstractFile(abstractFile: TAbstractFile): void {
    this.attachmentCollector.collectAttachmentsInAbstractFiles([abstractFile]);
  }

  protected override executeAbstractFiles(abstractFiles: TAbstractFile[]): void {
    this.attachmentCollector.collectAttachmentsInAbstractFiles(abstractFiles);
  }

  protected override shouldAddToAbstractFileMenu(): boolean {
    return true;
  }

  protected override shouldAddToAbstractFilesMenu(): boolean {
    return true;
  }
}
