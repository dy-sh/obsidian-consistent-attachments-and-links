import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { isValidRegExp } from 'obsidian-dev-utils/reg-exp';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';
import type {
  CollectAttachmentUsedByMultipleNotesMode,
  MigratableCollectSettings,
  MoveAttachmentToProperFolderUsedByMultipleNotesMode
} from './custom-attachment-location.ts';

import { PluginSettings } from './plugin-settings.ts';

// The saved record as a converter sees it: the keys this plugin used to declare, plus the ones it declares
// now, all optional because a record carries only what was actually saved.
type LegacySettingsRecord = Partial<LegacySettings> & Partial<PluginSettings>;

// Each proposal is assembled key by key, so it needs a mutable view of the readonly contract it produces.
type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

/**
 * Every key this plugin's `data.json` used to carry and no longer declares.
 *
 * Two groups here are declared so the converter can read them off the saved record and park them for the plugin
 * that owns them now: the record is rebuilt from the declared properties alone, so the first save after a
 * property was dropped would otherwise strip it from `data.json` before it could ever be offered.
 *
 * - Until 4.0.0, rename/delete handling, now Advanced Rename and Delete Handler's: `emptyFolderBehavior`,
 *   `shouldChangeNoteBacklinksDisplayText`, `shouldDeleteAttachmentsWithNote`,
 *   `shouldDeleteExistingFilesWhenMovingNote`, `shouldMoveAttachmentsWithNote` and `shouldUpdateLinks`.
 * - Until 5.0.0, attachment collecting, now Custom Attachment Location's: `attachmentUnitFolderPaths`,
 *   `collectAttachmentUsedByMultipleNotesMode`, `excludePathsFromAttachmentCollecting`,
 *   `moveAttachmentToProperFolderUsedByMultipleNotesMode` and `shouldCollectAttachmentsAutomatically`. The sixth
 *   collect key, `shouldAddCommandsToFileMenu`, is NOT declared: that plugin has no toggle for it, so there is
 *   nothing to park, and an undeclared key is dropped by the rebuild on its own.
 */
class LegacySettings {
  public attachmentUnitFolderPaths: string[] = [];
  public autoCollectAttachments = false;
  public changeNoteBacklinksAlt = false;
  public collectAttachmentUsedByMultipleNotesMode: CollectAttachmentUsedByMultipleNotesMode = 'Skip';
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteAttachmentsWithNote = false;
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteEmptyFolders = false;
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteExistFilesWhenMoveNote = false;
  public emptyAttachmentFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
  public emptyFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
  public excludePathsFromAttachmentCollecting: string[] = [];
  public ignoreFiles: string[] = [];
  public ignoreFolders: string[] = [];
  public moveAttachmentsWithNote = false;
  public moveAttachmentToProperFolderUsedByMultipleNotesMode: MoveAttachmentToProperFolderUsedByMultipleNotesMode = 'CopyAll';
  public shouldChangeNoteBacklinksDisplayText = true;
  public shouldCollectAttachmentsAutomatically = false;
  public shouldDeleteAttachmentsWithNote = false;
  public shouldDeleteExistingFilesWhenMovingNote = false;
  public shouldMoveAttachmentsWithNote = false;
  public shouldUpdateLinks = true;
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
        for (const ignoreFileRegExpString of legacySettings.ignoreFiles) {
          excludePaths.push(`/${ignoreFileRegExpString}$/`);
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

      parkRenameDeleteSettings(legacySettings);
      parkCollectSettings(legacySettings);
    });
  }

  protected override registerValidators(): void {
    super.registerValidators();
    this.registerValidator('includePaths', pathsValidator);
    this.registerValidator('excludePaths', pathsValidator);
  }
}

/**
 * Parks the collect values the saved record carries, for Custom Attachment Location — which owns them from
 * 5.0.0 on — so the migration component can offer them once.
 *
 * Same rules as {@link parkRenameDeleteSettings}: it runs after the ancient key names are mapped, and only a
 * key the record ACTUALLY carries is proposed.
 *
 * It is one-shot by construction, which the rename/delete parking is not: every key read here has left
 * {@link PluginSettings}, so the converter strips it from the record and the next load finds nothing to park.
 * A key that stayed would be re-parked on every load and bring a retired offer back.
 *
 * @param legacySettings - The saved record, mid-conversion.
 */
function parkCollectSettings(legacySettings: LegacySettingsRecord): void {
  const proposedCollectSettings: Mutable<MigratableCollectSettings> = {};

  if (legacySettings.attachmentUnitFolderPaths !== undefined) {
    proposedCollectSettings.attachmentUnitFolderPaths = legacySettings.attachmentUnitFolderPaths;
  }

  if (legacySettings.collectAttachmentUsedByMultipleNotesMode !== undefined) {
    proposedCollectSettings.collectAttachmentUsedByMultipleNotesMode = legacySettings.collectAttachmentUsedByMultipleNotesMode;
  }

  if (legacySettings.excludePathsFromAttachmentCollecting !== undefined) {
    proposedCollectSettings.excludePathsFromAttachmentCollecting = legacySettings.excludePathsFromAttachmentCollecting;
  }

  if (legacySettings.moveAttachmentToProperFolderUsedByMultipleNotesMode !== undefined) {
    proposedCollectSettings.moveAttachmentToProperFolderUsedByMultipleNotesMode = legacySettings.moveAttachmentToProperFolderUsedByMultipleNotesMode;
  }

  if (legacySettings.shouldCollectAttachmentsAutomatically !== undefined) {
    proposedCollectSettings.shouldCollectAttachmentsAutomatically = legacySettings.shouldCollectAttachmentsAutomatically;
  }

  if (Object.keys(proposedCollectSettings).length > 0) {
    legacySettings.proposedCollectSettings = proposedCollectSettings;
  }
}

/**
 * Parks the rename and delete values the saved record carries, for Advanced Rename and Delete Handler — which
 * owns them from 4.0.0 on — so the migration component can offer them once.
 *
 * Runs LAST in the converter, once the ancient key names have been mapped onto the ones this plugin used
 * until 4.0.0, so it reads one vocabulary rather than two.
 *
 * Only keys the record ACTUALLY carries are proposed, never a class default: an absent key means the user
 * never expressed a preference, so there is nothing of theirs to carry over. That is also what keeps a fresh
 * install — whose record has none of these — from being told it has a migration waiting.
 *
 * @param legacySettings - The saved record, mid-conversion.
 */
function parkRenameDeleteSettings(legacySettings: LegacySettingsRecord): void {
  const proposedRenameDeleteSettings: Mutable<MigratableSettings> = {};

  if (legacySettings.emptyFolderBehavior !== undefined) {
    proposedRenameDeleteSettings.emptyFolderBehavior = legacySettings.emptyFolderBehavior;
  }

  if (legacySettings.excludePaths !== undefined) {
    proposedRenameDeleteSettings.excludePaths = legacySettings.excludePaths;
  }

  if (legacySettings.includePaths !== undefined) {
    proposedRenameDeleteSettings.includePaths = legacySettings.includePaths;
  }

  if (legacySettings.shouldDeleteExistingFilesWhenMovingNote !== undefined) {
    proposedRenameDeleteSettings.shouldDeleteConflictingAttachments = legacySettings.shouldDeleteExistingFilesWhenMovingNote;
  }

  if (legacySettings.shouldDeleteAttachmentsWithNote !== undefined) {
    proposedRenameDeleteSettings.shouldHandleDeletions = legacySettings.shouldDeleteAttachmentsWithNote;
  }

  if (legacySettings.shouldUpdateLinks !== undefined) {
    proposedRenameDeleteSettings.shouldHandleRenames = legacySettings.shouldUpdateLinks;
  }

  if (legacySettings.shouldMoveAttachmentsWithNote !== undefined) {
    proposedRenameDeleteSettings.shouldRenameAttachmentFolder = legacySettings.shouldMoveAttachmentsWithNote;
  }

  if (legacySettings.shouldChangeNoteBacklinksDisplayText !== undefined) {
    proposedRenameDeleteSettings.shouldUpdateFileNameAliases = legacySettings.shouldChangeNoteBacklinksDisplayText;
  }

  if (legacySettings.treatAsAttachmentExtensions !== undefined) {
    proposedRenameDeleteSettings.treatAsAttachmentExtensions = legacySettings.treatAsAttachmentExtensions;
  }

  if (Object.keys(proposedRenameDeleteSettings).length > 0) {
    legacySettings.proposedRenameDeleteSettings = proposedRenameDeleteSettings;
  }
}

function pathsValidator(paths: string[]): MaybeReturn<string> {
  for (const path of paths) {
    if (!(path.startsWith('/') && path.endsWith('/'))) {
      continue;
    }

    const regExp = path.slice(1, -1);
    if (!isValidRegExp(regExp)) {
      return `Invalid regular expression ${path}`;
    }
  }
}
