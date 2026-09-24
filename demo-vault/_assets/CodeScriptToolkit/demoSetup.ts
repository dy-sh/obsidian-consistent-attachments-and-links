import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'consistent-attachments-and-links';

interface DemoSettingsPatch {
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
