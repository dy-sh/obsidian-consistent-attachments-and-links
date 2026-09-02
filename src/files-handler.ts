import type { App } from 'obsidian';

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

  public async deleteEmptyFolders(directoryName: string): Promise<void> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(directoryName)) {
      return;
    }

    directoryName = trimStart({ $string: directoryName, prefix: './' });

    let list = await listSafe(this.app, directoryName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await listSafe(this.app, directoryName);
    if (list.files.length === 0 && list.folders.length === 0 && await this.app.vault.exists(directoryName)) {
      try {
        await this.app.vault.adapter.rmdir(directoryName, false);
      } catch (error) {
        if (await this.app.vault.adapter.exists(directoryName)) {
          throw error;
        }
      }
    }
  }
}
