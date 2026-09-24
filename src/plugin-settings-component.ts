import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { isValidRegExp } from 'obsidian-dev-utils/reg-exp';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

import { PluginSettings } from './plugin-settings.ts';

// The saved record as a converter sees it: the keys this plugin used to declare, plus the ones it declares
// now, all optional because a record carries only what was actually saved.
type LegacySettingsRecord = Partial<LegacySettings> & Partial<PluginSettings>;

// The proposal is assembled key by key, so it needs a mutable view of the readonly contract it produces.
type MutableMigratableSettings = {
  -readonly [Key in keyof MigratableSettings]: MigratableSettings[Key];
};

// The rename and delete keys this plugin stopped declaring in 4.0.0, under the names it used until then. A
// record that still carries one has not been handed over yet.
const DROPPED_RENAME_DELETE_KEYS = [
  'emptyFolderBehavior',
  'shouldChangeNoteBacklinksDisplayText',
  'shouldDeleteAttachmentsWithNote',
  'shouldDeleteExistingFilesWhenMovingNote',
  'shouldMoveAttachmentsWithNote',
  'shouldUpdateLinks'
] as const satisfies readonly (keyof LegacySettings)[];

// The proposal keys whose source settings this plugin still declares, so every saved record carries them.
const STILL_DECLARED_PROPOSAL_KEYS = [
  'excludePaths',
  'includePaths',
  'treatAsAttachmentExtensions'
] as const satisfies readonly (keyof MigratableSettings)[];

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

class LegacySettings {
  public autoCollectAttachments = false;
  public changeNoteBacklinksAlt = false;
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteAttachmentsWithNote = false;
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteEmptyFolders = false;
  // eslint-disable-next-line unicorn/no-non-function-verb-prefix -- A legacy persisted settings key; renaming it would break migration from every existing data.json.
  public deleteExistFilesWhenMoveNote = false;
  public emptyAttachmentFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;

  /*
   * The six settings below were owned by this plugin until 4.0.0, when rename/delete handling moved to
   * Advanced Rename and Delete Handler. They are declared here so the converter can read them off the saved
   * record and park them for that plugin: the record is rebuilt from the declared properties alone, so the
   * first save after a property was dropped would otherwise strip it from `data.json` before it could ever
   * be offered.
   */
  public emptyFolderBehavior = EmptyFolderBehavior.DeleteWithEmptyParents;
  public ignoreFiles: string[] = [];
  public ignoreFolders: string[] = [];
  public moveAttachmentsWithNote = false;
  public shouldChangeNoteBacklinksDisplayText = true;
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
    });
  }

  protected override registerValidators(): void {
    super.registerValidators();
    this.registerValidator('includePaths', pathsValidator);
    this.registerValidator('excludePaths', pathsValidator);
  }
}

/**
 * Clears a proposal that issue #159 wrote, rather than one made of the user's own 3.x settings.
 *
 * Before the fix, every load re-parked the three still-declared keys and saved them, so an affected
 * `data.json` holds a proposal made of those keys alone — and it would be offered once more even with the
 * re-parking stopped. A genuine proposal always carries a dropped key as well, because 3.x saved the whole
 * record, so a proposal with none of them can only be the defect's.
 *
 * @param legacySettings - The saved record, mid-conversion, which carries no dropped key.
 */
function discardDefectProposal(legacySettings: LegacySettingsRecord): void {
  const proposal = legacySettings.proposedRenameDeleteSettings;
  if (!proposal) {
    return;
  }

  const stillDeclaredKeys: readonly string[] = STILL_DECLARED_PROPOSAL_KEYS;
  if (Object.keys(proposal).every((key) => stillDeclaredKeys.includes(key))) {
    legacySettings.proposedRenameDeleteSettings = null;
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
 * The converter runs on EVERY load, not once, so the parking has to be one-shot by itself. The signal is the
 * six rename and delete keys this plugin no longer declares: the first save rebuilds the record from the
 * declared keys alone, so they are gone from the second load on. `excludePaths`, `includePaths` and
 * `treatAsAttachmentExtensions` are still declared — other features here read them — so they sit in every
 * saved record and are proposed only alongside a dropped key. Parking them on their own re-offered the
 * migration on every start, after the user had already applied or dismissed it (issue #159).
 *
 * @param legacySettings - The saved record, mid-conversion.
 */
function parkRenameDeleteSettings(legacySettings: LegacySettingsRecord): void {
  const hasDroppedKey = DROPPED_RENAME_DELETE_KEYS.some((key) => legacySettings[key] !== undefined);

  if (!hasDroppedKey) {
    discardDefectProposal(legacySettings);
    return;
  }

  const proposedRenameDeleteSettings: MutableMigratableSettings = {};

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

  // Never empty: the dropped key that let this run is always one of the keys proposed above.
  legacySettings.proposedRenameDeleteSettings = proposedRenameDeleteSettings;
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
