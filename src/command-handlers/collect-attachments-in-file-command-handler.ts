import type { TAbstractFile } from 'obsidian';

import { AbstractFileCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/abstract-file-command-handler';
import {
  isFile,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';

import type { AttachmentCollector } from '../attachment-collector.ts';
import type { PluginSettingsComponent } from '../plugin-settings-component.ts';

interface CollectAttachmentsInFileCommandHandlerConstructorParams {
  readonly attachmentCollector: AttachmentCollector;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class CollectAttachmentsInFileCommandHandler extends AbstractFileCommandHandler {
  private readonly attachmentCollector: AttachmentCollector;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: CollectAttachmentsInFileCommandHandlerConstructorParams) {
    super({
      fileMenuItemName: 'Collect attachments in file',
      filesMenuItemName: 'Collect attachments in files',
      icon: 'download',
      id: 'collect-attachments-in-file',
      name: 'Collect attachments in current note'
    });

    this.attachmentCollector = params.attachmentCollector;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  protected override canExecuteAbstractFile(abstractFile: TAbstractFile): boolean {
    return !isFile(abstractFile) || isNote(abstractFile);
  }

  protected override canExecuteAbstractFiles(abstractFiles: TAbstractFile[]): boolean {
    for (const abstractFile of abstractFiles) {
      if (isFile(abstractFile) && !isNote(abstractFile)) {
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
    return this.pluginSettingsComponent.settings.shouldAddCommandsToFileMenu;
  }

  protected override shouldAddToAbstractFilesMenu(): boolean {
    return this.pluginSettingsComponent.settings.shouldAddCommandsToFileMenu;
  }
}
