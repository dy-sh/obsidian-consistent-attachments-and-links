/**
 * @file
 *
 * The plugin that owns attachment collecting since this plugin's 5.0.0, and the settings this plugin may
 * hand over to it.
 *
 * Only the PAYLOAD is declared here. The envelope carrying it — `migrateSettings`, who is proposing, and
 * whether the user applied it — is `SettingsMigrationApi` in
 * `obsidian-dev-utils/obsidian/plugin/settings-migration-api`, which both ends of the handover compile
 * against. That plugin is an Obsidian plugin repo, not an npm package, so the payload cannot be imported:
 * the authoritative copy is `MigratableCollectSettings` in its own `api.d.ts`, published at contract version
 * `1.1.0`.
 */

/**
 * The id of the plugin that owns attachment collecting, as listed in Obsidian's community plugin registry.
 */
export const CUSTOM_ATTACHMENT_LOCATION_PLUGIN_ID = 'obsidian-custom-attachment-location';

/**
 * The display name of that plugin, shown to the user.
 */
export const CUSTOM_ATTACHMENT_LOCATION_PLUGIN_NAME = 'Custom Attachment Location';

/**
 * What `Collect attachments` does with an attachment several notes reference. The spellings this plugin's
 * `data.json` stored, which are the ones that plugin's stores too.
 */
export type CollectAttachmentUsedByMultipleNotesMode = 'Cancel' | 'Copy' | 'Move' | 'Prompt' | 'Skip';

/**
 * The settings this plugin may propose. Every member is optional — only what the saved record actually
 * carried is proposed, so a value the owning plugin already holds is never overwritten by a default nobody
 * chose.
 *
 * `shouldAddCommandsToFileMenu` is deliberately absent: that plugin always puts its collect and move items in
 * the file menu, so it has no toggle for the value to land in.
 */
export interface MigratableCollectSettings {
  /**
   * Folders whose whole hierarchy travels as one attachment.
   */
  readonly attachmentUnitFolderPaths?: readonly string[];

  /**
   * What `Collect attachments` does with an attachment several notes reference.
   */
  readonly collectAttachmentUsedByMultipleNotesMode?: CollectAttachmentUsedByMultipleNotesMode;

  /**
   * Paths whose attachments `Collect attachments` leaves where they are.
   */
  readonly excludePathsFromAttachmentCollecting?: readonly string[];

  /**
   * What `Move attachment to proper folder` does with an attachment several notes reference.
   */
  readonly moveAttachmentToProperFolderUsedByMultipleNotesMode?: MoveAttachmentToProperFolderUsedByMultipleNotesMode;

  /**
   * Whether a note's attachments are collected each time the note changes.
   */
  readonly shouldCollectAttachmentsAutomatically?: boolean;
}

/**
 * What `Move attachment to proper folder` does with an attachment several notes reference.
 */
export type MoveAttachmentToProperFolderUsedByMultipleNotesMode = 'Cancel' | 'CopyAll' | 'Prompt' | 'Skip';
