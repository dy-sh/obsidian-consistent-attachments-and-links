/**
 * @file
 *
 * The plugin that owns rename/delete handling since this plugin's 4.0.0, and the shape of its public API as
 * this plugin compiles against it.
 *
 * The API is declared here rather than imported: that plugin is an Obsidian plugin repo, not an npm package,
 * so there is nothing to depend on. It publishes contract version `1.0.0`, so consumers ask for `^1`. The
 * authoritative copy is its own `src/plugin-api.ts`.
 */

import type { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';

/**
 * The id of the plugin that owns rename/delete handling, as listed in Obsidian's community plugin registry.
 */
export const ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID = 'advanced-rename-and-delete-handler';

/**
 * The display name of that plugin, shown to the user.
 */
export const ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME = 'Advanced Rename and Delete Handler';

/**
 * Advanced Rename and Delete Handler's API, as this plugin uses it.
 */
export interface AdvancedRenameAndDeleteHandlerApi {
  /**
   * Offers the user a set of settings values this plugin proposes, and applies what they approve.
   *
   * @param params - The proposal.
   * @returns What the user approved.
   */
  migrateSettings(params: MigrateSettingsParams): Promise<MigrateSettingsResult>;
}

/**
 * The settings this plugin may propose. Every member is optional — only what the user actually customized is
 * proposed, so a value the owning plugin already holds is never overwritten by a default nobody chose.
 *
 * A narrower view of that plugin's own `MigratableSettings`: `shouldRenameAttachmentFiles`,
 * `shouldRescueSharedAttachments` and `notePriorities` are omitted because this plugin never had an
 * equivalent setting to carry over.
 */
export interface MigratableSettings {
  /**
   * What to do with a folder a deletion or a move has left empty.
   */
  readonly emptyFolderBehavior?: EmptyFolderBehavior;

  /**
   * Paths the handler leaves alone entirely.
   */
  readonly excludePaths?: readonly string[];

  /**
   * Paths the handler is limited to. Empty means the whole vault.
   */
  readonly includePaths?: readonly string[];

  /**
   * Whether an attachment that collides with an existing file at the destination replaces it.
   */
  readonly shouldDeleteConflictingAttachments?: boolean;

  /**
   * Whether deleting a note also deletes the attachments only that note referenced.
   */
  readonly shouldHandleDeletions?: boolean;

  /**
   * Whether renames and moves are handled at all.
   */
  readonly shouldHandleRenames?: boolean;

  /**
   * Whether renaming a note renames (or moves) its attachment folder alongside it.
   */
  readonly shouldRenameAttachmentFolder?: boolean;

  /**
   * Whether renaming a note rewrites the display text of the links that pointed at its old name.
   */
  readonly shouldUpdateFileNameAliases?: boolean;

  /**
   * Extensions whose files are attachments even though their extension says otherwise.
   */
  readonly treatAsAttachmentExtensions?: readonly string[];
}

/**
 * Parameters for {@link AdvancedRenameAndDeleteHandlerApi.migrateSettings}.
 */
export interface MigrateSettingsParams {
  /**
   * The values this plugin proposes.
   */
  readonly proposedSettings: MigratableSettings;

  /**
   * The `manifest.id` of the plugin making the proposal, shown in the dialog.
   */
  readonly sourcePluginId: string;
}

/**
 * The outcome of {@link AdvancedRenameAndDeleteHandlerApi.migrateSettings}.
 */
export interface MigrateSettingsResult {
  /**
   * Whether the user approved the migration. `false` means they cancelled and nothing was written — the
   * proposal must NOT be recorded as done.
   */
  readonly isApplied: boolean;
}
