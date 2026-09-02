import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'consistent-attachments-and-links';
const TRIP_FOLDER_PATH = 'Materials/01 Collect attachments into the note\'s folder';
const TRIP_NOTE_PATH = `${TRIP_FOLDER_PATH}/Trip.md`;

// The attachment starts in one shared folder at the vault root — Obsidian's own default, and the
// Arrangement collecting exists to undo.
const SHARED_ATTACHMENTS_FOLDER_PATH = 'Materials/_shared-attachments';
const TRIP_ATTACHMENT_PATH = `${SHARED_ATTACHMENTS_FOLDER_PATH}/trip-photo.svg`;

interface DemoSettingsPatch {
  shouldCollectAttachmentsAutomatically?: boolean;
}

// A tiny SVG rather than a binary image: it is a real attachment as far as the plugin is concerned,
// It is legible in the diff, and the vault does not have to ship a picture for the walkthrough.
const TRIP_ATTACHMENT_CONTENT = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">',
  '  <rect width="120" height="80" fill="#4a7" />',
  '  <text x="60" y="45" font-size="14" text-anchor="middle" fill="white">trip</text>',
  '</svg>',
  ''
].join('\n');

const TRIP_NOTE_CONTENT = [
  '# Trip',
  '',
  'A note whose only attachment lives in a shared folder somewhere else, so you can watch collecting',
  'bring it home.',
  '',
  '![trip-photo](<../_shared-attachments/trip-photo.svg>)',
  ''
].join('\n');

/**
 * Creates the note-plus-distant-attachment pair the walkthrough asks you to make by hand.
 *
 * The manual steps are "create a note" then "paste or drag an image into it", which needs an image to
 * hand and leaves the attachment wherever your Obsidian settings put it — so the demo would start from a
 * different place for every reader. This puts it somewhere deliberately wrong instead.
 *
 * Manual equivalent: create `Trip.md`, and embed an image that lives in some other folder.
 */
export async function createTripNote(app: App): Promise<void> {
  for (const folderPath of [TRIP_FOLDER_PATH, SHARED_ATTACHMENTS_FOLDER_PATH]) {
    if (!app.vault.getFolderByPath(folderPath)) {
      await app.vault.createFolder(folderPath);
    }
  }

  const existingAttachment = app.vault.getFileByPath(TRIP_ATTACHMENT_PATH);
  if (existingAttachment) {
    await app.vault.modify(existingAttachment, TRIP_ATTACHMENT_CONTENT);
  } else {
    await app.vault.create(TRIP_ATTACHMENT_PATH, TRIP_ATTACHMENT_CONTENT);
  }

  const existingNote = app.vault.getFileByPath(TRIP_NOTE_PATH);
  if (existingNote) {
    await app.vault.modify(existingNote, TRIP_NOTE_CONTENT);
  } else {
    await app.vault.create(TRIP_NOTE_PATH, TRIP_NOTE_CONTENT);
  }

  const note = app.vault.getFileByPath(TRIP_NOTE_PATH);
  if (note) {
    await app.workspace.getLeaf(false).openFile(note);
  }

  new Notice('Trip.md is ready, with its attachment parked in a shared folder.');
}

/**
 * Deletes everything the buttons above created.
 *
 * Manual equivalent: delete the `Materials/01 Collect attachments into the note's folder` and
 * `Materials/_shared-attachments` folders.
 */
export async function resetTripDemo(app: App): Promise<void> {
  for (const folderPath of [TRIP_FOLDER_PATH, SHARED_ATTACHMENTS_FOLDER_PATH]) {
    const folder = app.vault.getFolderByPath(folderPath);
    if (folder) {
      await app.fileManager.trashFile(folder);
    }
  }
  new Notice('Trip demo reset.');
}

/**
 * Runs one of the plugin's commands.
 *
 * Manual equivalent: the Command Palette entry of the same name.
 */
export function runCommand(app: App, commandId: string): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:${commandId}`);
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> Consistent
 * Attachments and Links**.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied.');
}
