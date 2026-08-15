import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'consistent-attachments-and-links';
const TRIP_FOLDER_PATH = 'Materials/01 Attachments move with their note';
const TRIP_NOTE_PATH = `${TRIP_FOLDER_PATH}/Trip.md`;
const TRIP_ATTACHMENT_PATH = `${TRIP_FOLDER_PATH}/trip-photo.svg`;
const ARCHIVE_FOLDER_PATH = `${TRIP_FOLDER_PATH}/Archive`;
const MOVED_TRIP_NOTE_PATH = `${ARCHIVE_FOLDER_PATH}/Trip.md`;

interface DemoSettingsPatch {
  shouldCollectAttachmentsAutomatically?: boolean;
  shouldDeleteAttachmentsWithNote?: boolean;
  shouldMoveAttachmentsWithNote?: boolean;
  shouldUpdateLinks?: boolean;
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
  'A note with an attachment of its own, so you can watch the two travel together.',
  '',
  '![trip-photo](<./trip-photo.svg>)',
  ''
].join('\n');

/**
 * Creates the note-plus-attachment pair the walkthrough asks you to make by hand.
 *
 * The manual steps are "create a note" then "paste or drag an image into it", which needs an image to
 * hand and leaves the attachment wherever your Obsidian settings put it — so the demo starts from a
 * different place for every reader.
 *
 * Manual equivalent: create `Trip.md` and paste an image into it.
 */
export async function createTripNote(app: App): Promise<void> {
  if (!app.vault.getFolderByPath(TRIP_FOLDER_PATH)) {
    await app.vault.createFolder(TRIP_FOLDER_PATH);
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

  new Notice('Trip.md and its attachment are ready.');
}

/**
 * Moves `Trip.md` into an `Archive` subfolder — the step whose result is the whole lesson.
 *
 * Manual equivalent: drag `Trip.md` into a folder in the File Explorer.
 */
export async function moveTripNoteToArchive(app: App): Promise<void> {
  const note = app.vault.getFileByPath(TRIP_NOTE_PATH);
  if (!note) {
    new Notice('Trip.md is not where it started — create it again first.');
    return;
  }

  if (!app.vault.getFolderByPath(ARCHIVE_FOLDER_PATH)) {
    await app.vault.createFolder(ARCHIVE_FOLDER_PATH);
  }

  await app.fileManager.renameFile(note, MOVED_TRIP_NOTE_PATH);
  new Notice('Moved. Did the attachment come with it, and does the embed still resolve?');
}

/**
 * Deletes everything the two buttons above created.
 *
 * Manual equivalent: delete the `Materials/01 Attachments move with their note` folder.
 */
export async function resetTripDemo(app: App): Promise<void> {
  const folder = app.vault.getFolderByPath(TRIP_FOLDER_PATH);
  if (folder) {
    await app.fileManager.trashFile(folder);
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
