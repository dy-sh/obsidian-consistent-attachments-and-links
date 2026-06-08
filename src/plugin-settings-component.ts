import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { isValidRegExp } from 'obsidian-dev-utils/reg-exp';

import { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

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

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      ...params,
      pluginSettingsClass: PluginSettings
    });
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
        for (const ignoreFolder of legacySettings.ignoreFolders) {
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
