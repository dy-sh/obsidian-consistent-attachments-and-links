import type { MaybeReturn } from 'obsidian-dev-utils/Type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import { PluginSettings } from './PluginSettings.ts';

interface LegacySettings extends PluginSettings {
  ignoreFiles: string[];
  ignoreFolders: string[];
}

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginSettings> {
  protected override addValidators(): void {
    this.addValidator('includePaths', pathsValidator);
    this.addValidator('excludePaths', pathsValidator);
  }

  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override onLoadRecord(record: Record<string, unknown>): void {
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
