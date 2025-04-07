import type { MaybeReturn } from 'obsidian-dev-utils/Type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

interface LegacySettings extends PluginSettings {
  ignoreFiles: string[];
  ignoreFolders: string[];
}

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginTypes> {
  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override async onLoadRecord(record: Record<string, unknown>): Promise<void> {
    await super.onLoadRecord(record);
    const legacySettings = record as Partial<LegacySettings>;
    if (!(legacySettings.ignoreFiles || legacySettings.ignoreFolders)) {
      return;
    }

    const excludePaths = legacySettings.excludePaths ?? [];

    for (const ignoreFileRegExpStr of legacySettings.ignoreFiles ?? []) {
      excludePaths.push(`/${ignoreFileRegExpStr}$/`);
    }

    for (const ignoreFolder of legacySettings.ignoreFolders ?? []) {
      excludePaths.push(ignoreFolder);
    }

    if (excludePaths.length > 0) {
      legacySettings.excludePaths = excludePaths;
    }

    delete legacySettings.ignoreFiles;
    delete legacySettings.ignoreFolders;
  }

  protected override registerValidators(): void {
    super.registerValidators();
    this.registerValidator('includePaths', pathsValidator);
    this.registerValidator('excludePaths', pathsValidator);
  }
}

function pathsValidator(paths: string[]): MaybeReturn<string> {
  for (const path of paths) {
    if (path.startsWith('/') && path.endsWith('/')) {
      const regExp = path.slice(1, -1);
      if (!isValidRegExp(regExp)) {
        return `Invalid regular expression ${path}`;
      }
    }
  }
}
