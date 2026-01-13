import type { MaybeReturn } from 'obsidian-dev-utils/Type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/RenameDeleteHandler';
import { isValidRegExp } from 'obsidian-dev-utils/RegExp';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

interface LegacySettings extends PluginSettings {
  autoCollectAttachments: boolean;
  changeNoteBacklinksAlt: boolean;
  deleteAttachmentsWithNote: boolean;
  deleteEmptyFolders: boolean;
  deleteExistFilesWhenMoveNote: boolean;
  emptyAttachmentFolderBehavior: EmptyFolderBehavior;
  ignoreFiles: string[];
  ignoreFolders: string[];
  moveAttachmentsWithNote: boolean;
  showBackupWarning: boolean;
  updateLinks: boolean;
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
      legacySettings.emptyFolderBehavior = legacySettings.deleteEmptyFolders
        ? EmptyFolderBehavior.DeleteWithEmptyParents
        : EmptyFolderBehavior.Keep;
      delete legacySettings.deleteEmptyFolders;
    }

    if (legacySettings.emptyAttachmentFolderBehavior !== undefined) {
      legacySettings.emptyFolderBehavior = legacySettings.emptyAttachmentFolderBehavior;
      delete legacySettings.emptyAttachmentFolderBehavior;
    }

    if (legacySettings.autoCollectAttachments !== undefined) {
      legacySettings.shouldCollectAttachmentsAutomatically = legacySettings.autoCollectAttachments;
      delete legacySettings.autoCollectAttachments;
    }

    if (legacySettings.changeNoteBacklinksAlt !== undefined) {
      legacySettings.shouldChangeNoteBacklinksDisplayText = legacySettings.changeNoteBacklinksAlt;
      delete legacySettings.changeNoteBacklinksAlt;
    }

    if (legacySettings.deleteAttachmentsWithNote !== undefined) {
      legacySettings.shouldDeleteAttachmentsWithNote = legacySettings.deleteAttachmentsWithNote;
      delete legacySettings.deleteAttachmentsWithNote;
    }

    if (legacySettings.deleteExistFilesWhenMoveNote !== undefined) {
      legacySettings.shouldDeleteExistingFilesWhenMovingNote = legacySettings.deleteExistFilesWhenMoveNote;
      delete legacySettings.deleteExistFilesWhenMoveNote;
    }

    if (legacySettings.moveAttachmentsWithNote !== undefined) {
      legacySettings.shouldMoveAttachmentsWithNote = legacySettings.moveAttachmentsWithNote;
      delete legacySettings.moveAttachmentsWithNote;
    }

    if (legacySettings.showBackupWarning !== undefined) {
      legacySettings.shouldShowBackupWarning = legacySettings.showBackupWarning;
      delete legacySettings.showBackupWarning;
    }

    if (legacySettings.updateLinks !== undefined) {
      legacySettings.shouldUpdateLinks = legacySettings.updateLinks;
      delete legacySettings.updateLinks;
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
