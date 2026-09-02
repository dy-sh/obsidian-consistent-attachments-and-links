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
  shouldCreateNoteToPreserveOriginalName?: boolean;
  shouldEnsurePathCompatibilityOnAndroid?: boolean;
  shouldEnsurePathCompatibilityOnWindows?: boolean;
}

const PATH_COMPATIBILITY_FOLDER_PATH = 'Materials/08 Keep paths valid on every platform';

/*
 * 100 CJK characters are 300 UTF-8 bytes — over the 255-byte per-name limit every Linux, Android, macOS and
 * iOS filesystem enforces, and nowhere near any limit Windows has. That gap is the whole point of the demo,
 * and it is why the walkthrough turns the Android rule on rather than relying on the host's own.
 */
const LONG_NAME = '文'.repeat(100);
const LONG_NAME_NOTE_PATH = `${PATH_COMPATIBILITY_FOLDER_PATH}/${LONG_NAME}.md`;
const LINKING_NOTE_PATH = `${PATH_COMPATIBILITY_FOLDER_PATH}/Points at the long name.md`;

const LONG_NAME_NOTE_CONTENT = [
  '# A name no Android device will accept',
  '',
  'This note\'s file name is 100 CJK characters, which is 300 bytes in UTF-8. Windows is perfectly happy',
  'with it; ext4 is not.',
  ''
].join('\n');

const LINKING_NOTE_CONTENT = [
  '# Points at the long name',
  '',
  `[the long-named note](<${LONG_NAME}.md>)`,
  '',
  'Watch this link after the repair: it follows the rename on its own.',
  ''
].join('\n');

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
 * Creates a note whose file name is valid on Windows and invalid on Android, plus a note linking to it.
 *
 * Doing this by hand means typing 100 CJK characters into a file name, and the point of the demo — that the
 * limit is counted in BYTES, not characters — is invisible until you do. Turning the Android rule on (and the
 * Windows one off) makes the walkthrough behave the same whatever machine you read it on.
 *
 * Manual equivalent: create a note with a very long non-Latin name, link to it from another note, and tick
 * **Ensure path compatibility on Android** in the settings tab.
 */
export async function createLongNameNote(app: App): Promise<void> {
  if (!app.vault.getFolderByPath(PATH_COMPATIBILITY_FOLDER_PATH)) {
    await app.vault.createFolder(PATH_COMPATIBILITY_FOLDER_PATH);
  }

  for (const [path, content] of [[LONG_NAME_NOTE_PATH, LONG_NAME_NOTE_CONTENT], [LINKING_NOTE_PATH, LINKING_NOTE_CONTENT]] as const) {
    const existing = app.vault.getFileByPath(path);
    if (existing) {
      await app.vault.modify(existing, content);
    } else {
      await app.vault.create(path, content);
    }
  }

  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      shouldEnsurePathCompatibilityOnAndroid: true,
      shouldEnsurePathCompatibilityOnWindows: false
    }
  });

  const note = app.vault.getFileByPath(LINKING_NOTE_PATH);
  if (note) {
    await app.workspace.getLeaf(false).openFile(note);
  }

  new Notice('A note with a 300-byte name is ready, and the Android rule is on.');
}

/**
 * Deletes what the path-compatibility buttons created and puts the platform toggles back.
 *
 * Manual equivalent: delete the `Materials/08 Keep paths valid on every platform` folder and restore the
 * platform toggles in the settings tab.
 */
export async function resetPathCompatibilityDemo(app: App): Promise<void> {
  const folder = app.vault.getFolderByPath(PATH_COMPATIBILITY_FOLDER_PATH);
  if (folder) {
    await app.fileManager.trashFile(folder);
  }

  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      shouldEnsurePathCompatibilityOnAndroid: false,
      shouldEnsurePathCompatibilityOnWindows: true
    }
  });

  new Notice('Path compatibility demo reset.');
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
