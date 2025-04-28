import type { MaybeReturn } from 'obsidian-dev-utils/Type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';
import { EmptyAttachmentFolderBehavior } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

interface LegacySettings extends PluginSettings {
  deleteEmptyFolders: boolean;
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

    const excludePaths = legacySettings.excludePaths ?? [];

    if (legacySettings.ignoreFiles) {
      for (const ignoreFileRegExpStr of legacySettings.ignoreFiles) {
        excludePaths.push(`/${ignoreFileRegExpStr}$/`);
      }
      delete legacySettings.ignoreFiles;
    }

    if (legacySettings.ignoreFolders) {
      for (const ignoreFolder of legacySettings.ignoreFolders ?? []) {
        excludePaths.push(ignoreFolder);
      }

      delete legacySettings.ignoreFolders;
    }

    if (excludePaths.length > 0) {
      legacySettings.excludePaths = excludePaths;
    }

    if (legacySettings.deleteEmptyFolders !== undefined) {
      legacySettings.emptyAttachmentFolderBehavior = legacySettings.deleteEmptyFolders
        ? EmptyAttachmentFolderBehavior.DeleteWithEmptyParents
        : EmptyAttachmentFolderBehavior.Keep;
    }
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
