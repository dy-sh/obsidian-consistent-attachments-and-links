/**
 * @file
 *
 * The plugin that owns rename/delete handling since this plugin's 4.0.0, and the settings this plugin may
 * hand over to it.
 *
 * Only the PAYLOAD is declared here. The envelope carrying it — `migrateSettings`, who is proposing, and
 * whether the user applied it — is `SettingsMigrationApi` in
 * `obsidian-dev-utils/obsidian/plugin/settings-migration-api`, which both ends of the handover compile
 * against, so that half can no longer drift silently. What stays this plugin's own is which settings it has
 * to offer, which is nobody else's business. That plugin publishes contract version `1.0.0`, so consumers
 * ask for `^1`; the authoritative copy is its own `src/plugin-api.ts`.
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
