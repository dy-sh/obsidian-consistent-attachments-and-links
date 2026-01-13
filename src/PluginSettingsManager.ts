import type { MaybeReturn } from 'obsidian-dev-utils/Type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

class LegacySettings {
  public autoCollectAttachments = false;
  public changeNoteBacklinksAlt = false;
  public deleteAttachmentsWithNote = false;
  public deleteEmptyFolders = false;
  public deleteExistFilesWhenMoveNote = false;
  public emptyAttachmentFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
  public ignoreFiles: string[] = [];
  public ignoreFolders: string[] = [];
  public moveAttachmentsWithNote = false;
  public showBackupWarning = false;
  public updateLinks = false;
}

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginTypes> {
  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override registerLegacySettingsConverters(): void {
    this.registerLegacySettingsConverter(LegacySettings, (legacySettings) => {
      const excludePaths = legacySettings.excludePaths ?? [];

      if (legacySettings.ignoreFiles) {
        for (const ignoreFileRegExpStr of legacySettings.ignoreFiles) {
          excludePaths.push(`/${ignoreFileRegExpStr}$/`);
        }
      }

      if (legacySettings.ignoreFolders) {
        for (const ignoreFolder of legacySettings.ignoreFolders ?? []) {
          excludePaths.push(ignoreFolder);
        }
      }

      if (excludePaths.length > 0) {
        legacySettings.excludePaths = excludePaths;
      }

      if (legacySettings.deleteEmptyFolders !== undefined) {
        legacySettings.emptyFolderBehavior = legacySettings.deleteEmptyFolders
          ? EmptyFolderBehavior.DeleteWithEmptyParents
          : EmptyFolderBehavior.Keep;
      }

      if (legacySettings.emptyAttachmentFolderBehavior !== undefined) {
        legacySettings.emptyFolderBehavior = legacySettings.emptyAttachmentFolderBehavior;
      }

      if (legacySettings.autoCollectAttachments !== undefined) {
        legacySettings.shouldCollectAttachmentsAutomatically = legacySettings.autoCollectAttachments;
      }

      if (legacySettings.changeNoteBacklinksAlt !== undefined) {
        legacySettings.shouldChangeNoteBacklinksDisplayText = legacySettings.changeNoteBacklinksAlt;
      }

      if (legacySettings.deleteAttachmentsWithNote !== undefined) {
        legacySettings.shouldDeleteAttachmentsWithNote = legacySettings.deleteAttachmentsWithNote;
      }

      if (legacySettings.deleteExistFilesWhenMoveNote !== undefined) {
        legacySettings.shouldDeleteExistingFilesWhenMovingNote = legacySettings.deleteExistFilesWhenMoveNote;
      }

      if (legacySettings.moveAttachmentsWithNote !== undefined) {
        legacySettings.shouldMoveAttachmentsWithNote = legacySettings.moveAttachmentsWithNote;
      }

      if (legacySettings.showBackupWarning !== undefined) {
        legacySettings.shouldShowBackupWarning = legacySettings.showBackupWarning;
      }

      if (legacySettings.updateLinks !== undefined) {
        legacySettings.shouldUpdateLinks = legacySettings.updateLinks;
      }
    });
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
