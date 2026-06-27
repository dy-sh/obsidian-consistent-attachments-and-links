import type { App } from 'obsidian';
import type { PathOrAbstractFile } from 'obsidian-dev-utils/obsidian/file-system';

import {
  getPath,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import { listSafe } from 'obsidian-dev-utils/obsidian/vault';
import { trimStart } from 'obsidian-dev-utils/string';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

interface FilesHandlerConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class FilesHandler {
  private readonly app: App;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: FilesHandlerConstructorParams) {
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async deleteEmptyFolders(dirName: string): Promise<void> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(dirName)) {
      return;
    }

    dirName = trimStart({ prefix: './', str: dirName });

    let list = await listSafe(this.app, dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await listSafe(this.app, dirName);
    if (list.files.length === 0 && list.folders.length === 0) {
      if (await this.app.vault.exists(dirName)) {
        try {
          await this.app.vault.adapter.rmdir(dirName, false);
        } catch (e) {
          if (await this.app.vault.adapter.exists(dirName)) {
            throw e;
          }
        }
      }
    }
  }

  public isNoteEx(pathOrFile: null | PathOrAbstractFile): boolean {
    if (!pathOrFile || !isNote(pathOrFile)) {
      return false;
    }

    const path = getPath(this.app, pathOrFile);
    return this.pluginSettingsComponent.settings.treatAsAttachmentExtensions.every((extension) => !path.endsWith(extension));
  }
}
