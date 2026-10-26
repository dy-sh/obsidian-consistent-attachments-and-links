import type { App } from 'obsidian';

import {
  MarkdownView,
  Notice
} from 'obsidian';
import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';

const PLUGIN_ID = 'consistent-attachments-and-links';

interface DemoSettingsPatch {
  shouldCreateNoteToPreserveOriginalName?: boolean;
  shouldEnsurePathCompatibilityOnAndroid?: boolean;
  shouldEnsurePathCompatibilityOnWindows?: boolean;
  shouldNormalizeUnicodeNames?: boolean;
  treatAsAttachmentExtensions?: readonly string[];
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

// `й` composed (U+0439). Stored decomposed, it is `и` (U+0438) followed by U+0306 COMBINING BREVE.
const DECOMPOSED_NOTE_BASENAME = 'Заметка-й';
const DECOMPOSED_NOTE_PATH = `${PATH_COMPATIBILITY_FOLDER_PATH}/${DECOMPOSED_NOTE_BASENAME}.md`;
const DECOMPOSED_LINKING_NOTE_PATH = `${PATH_COMPATIBILITY_FOLDER_PATH}/Points at the decomposed name.md`;
const DECOMPOSED_NOTE_TIMEOUT_IN_MILLISECONDS = 10_000;

interface RawWriteAdapter {
  fs?: { write(fullPath: string, data: string): Promise<void> };
  fsPromises?: { writeFile(fullPath: string, data: string): Promise<void> };
  getFullRealPath(realPath: string): string;
  onFileChange(realPath: string): void;
}

/**
 * Writes a note whose name is stored on disk in decomposed Unicode form (NFD), plus a note linking to it.
 *
 * Obsidian cannot create such a name: it composes every name it creates. So the note is written straight to
 * disk, the way these names arrive from an old macOS disk or an archive, and Obsidian is then told to look.
 *
 * Manual equivalent: copy a file whose name was decomposed elsewhere (for example on an HFS+ volume) into the
 * vault, and make sure **Normalize Unicode names to NFC** is on in the settings tab.
 */
export async function createDecomposedNameNote(app: App): Promise<void> {
  if (!app.vault.getFolderByPath(PATH_COMPATIBILITY_FOLDER_PATH)) {
    await app.vault.createFolder(PATH_COMPATIBILITY_FOLDER_PATH);
  }

  const adapter = app.vault.adapter as unknown as RawWriteAdapter;
  const realPath = DECOMPOSED_NOTE_PATH.normalize('NFD');
  const fullRealPath = adapter.getFullRealPath(realPath);
  const content = '# A name stored in NFD\n\nIt looks like any other name. On disk, every `й` in it is two characters.\n';

  if (!app.vault.getFileByPath(DECOMPOSED_NOTE_PATH)) {
    if (adapter.fsPromises) {
      await adapter.fsPromises.writeFile(fullRealPath, content);
    } else {
      await adapter.fs?.write(fullRealPath, content);
    }
    adapter.onFileChange(realPath);

    const deadline = Date.now() + DECOMPOSED_NOTE_TIMEOUT_IN_MILLISECONDS;
    while (!app.vault.getFileByPath(DECOMPOSED_NOTE_PATH)) {
      if (Date.now() > deadline) {
        throw new Error(`Obsidian did not pick up ${DECOMPOSED_NOTE_PATH} within ${String(DECOMPOSED_NOTE_TIMEOUT_IN_MILLISECONDS)} ms.`);
      }
      await sleep(CONSISTENCY_REPORT_POLL_INTERVAL_IN_MILLISECONDS);
    }
  }

  const linkingContent = `# Points at the decomposed name\n\n[[${DECOMPOSED_NOTE_BASENAME}]]\n\nThis link works before the repair and after it.\n`;
  const linkingNote = app.vault.getFileByPath(DECOMPOSED_LINKING_NOTE_PATH);
  if (linkingNote) {
    await app.vault.modify(linkingNote, linkingContent);
  } else {
    await app.vault.create(DECOMPOSED_LINKING_NOTE_PATH, linkingContent);
  }

  await configureCommunityPlugin({
    app,
    pluginId: PLUGIN_ID,
    settings: {
      shouldNormalizeUnicodeNames: true
    }
  });

  new Notice('A note whose name is stored in NFD is ready.');
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
      shouldEnsurePathCompatibilityOnWindows: true,
      shouldNormalizeUnicodeNames: true
    }
  });

  new Notice('Path compatibility demo reset.');
}

/**
 * Runs one of the plugin's commands.
 *
 * It returns as soon as the command has STARTED: the plugin runs every command fire-and-forget, so
 * nothing here can await its end. For a command that later opens a note, use a wrapper that waits for
 * that, as {@link checkConsistency} does.
 *
 * Manual equivalent: the Command Palette entry of the same name.
 */
export function runCommand(app: App, commandId: string): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:${commandId}`);
}

const DEFAULT_CONSISTENCY_REPORT_PATH = 'consistency-report.md';
const CONSISTENCY_REPORT_TIMEOUT_IN_MILLISECONDS = 30_000;
const CONSISTENCY_REPORT_POLL_INTERVAL_IN_MILLISECONDS = 50;

/**
 * Runs **Check vault consistency** and returns once its report is written and showing in a tab.
 *
 * Fired and forgotten, the check walks the vault in the background and then opens the report IN THE
 * ACTIVE TAB — replacing whatever note is there by then. A reader who has moved on to the next
 * walkthrough, or the suite clicking every button in this vault, has that note swapped out from under
 * them seconds later, and the slower the walk (a cold start, a busy machine) the later the swap lands.
 * Waiting for the report makes the button's `Executed successfully` mean the report is there to read.
 *
 * Manual equivalent: run **Check vault consistency** from the Command Palette.
 */
export async function checkConsistency(app: App): Promise<void> {
  const reportPath = await getConsistencyReportPath(app);

  let isReportWritten = false;
  const modifyEventRef = app.vault.on('modify', (file) => {
    if (file.path === reportPath) {
      isReportWritten = true;
    }
  });

  try {
    runCommand(app, 'check-consistency');

    // The report is written first and opened second, and it is opened only when no tab shows it yet —
    // so "written, and showing somewhere" holds after either path.
    const deadline = Date.now() + CONSISTENCY_REPORT_TIMEOUT_IN_MILLISECONDS;
    while (!(isReportWritten && isReportShowing(app, reportPath))) {
      if (Date.now() > deadline) {
        throw new Error(`The consistency report ${reportPath} did not appear within ${String(CONSISTENCY_REPORT_TIMEOUT_IN_MILLISECONDS)} ms.`);
      }
      await sleep(CONSISTENCY_REPORT_POLL_INTERVAL_IN_MILLISECONDS);
    }
  } finally {
    app.vault.offref(modifyEventRef);
  }
}

const DEFAULT_TREAT_AS_ATTACHMENT_EXTENSIONS = ['.excalidraw.md'];

/**
 * Puts `treatAsAttachmentExtensions` back to its default and runs **Check vault consistency**, so the stand-in
 * drawing in `Materials/03 Check vault consistency` is judged as an attachment and listed as misplaced.
 *
 * Manual equivalent: make sure `.excalidraw.md` is listed in **Treat as attachment extensions** in the settings
 * tab, then run **Check vault consistency** from the Command Palette.
 */
export async function checkDrawingAsAttachment(app: App): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { treatAsAttachmentExtensions: DEFAULT_TREAT_AS_ATTACHMENT_EXTENSIONS } });
  await checkConsistency(app);
}

/**
 * Empties `treatAsAttachmentExtensions` and runs **Check vault consistency**, so the stand-in drawing reads as
 * a note and is no longer judged.
 *
 * Manual equivalent: remove every entry from **Treat as attachment extensions** in the settings tab, then run
 * **Check vault consistency** from the Command Palette.
 */
export async function checkDrawingAsNote(app: App): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { treatAsAttachmentExtensions: [] } });
  await checkConsistency(app);
}

/**
 * Puts `treatAsAttachmentExtensions` back to its default after {@link checkDrawingAsNote} emptied it.
 *
 * Manual equivalent: add `.excalidraw.md` back to **Treat as attachment extensions** in the settings tab.
 */
export async function resetDrawingDemo(app: App): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: { treatAsAttachmentExtensions: DEFAULT_TREAT_AS_ATTACHMENT_EXTENSIONS } });
  new Notice('treatAsAttachmentExtensions is back to its default.');
}

async function getConsistencyReportPath(app: App): Promise<string> {
  const data: unknown = await app.plugins.getPlugin(PLUGIN_ID)?.loadData();
  if (typeof data === 'object' && data !== null) {
    const reportPath = (data as Record<string, unknown>)['consistencyReportFile'];
    if (typeof reportPath === 'string' && reportPath !== '') {
      return reportPath;
    }
  }
  return DEFAULT_CONSISTENCY_REPORT_PATH;
}

function isReportShowing(app: App, reportPath: string): boolean {
  return app.workspace.getLeavesOfType('markdown').some((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.path === reportPath);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> `Consistent
 * Attachments and Links`**.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied.');
}

const BROKEN_LINKS_FOLDER_PATH = 'Materials/09 Fix broken links';
const BROKEN_LINKS_VIEW_TYPE = `${PLUGIN_ID}-broken-links`;
const BROKEN_LINKS_VIEW_TIMEOUT_IN_MILLISECONDS = 30_000;

/**
 * Creates a small trip folder and a note linking into it, then renames the folder the way a file manager would:
 * through the vault, so Obsidian rewrites no link. Every link into the folder is broken afterwards.
 *
 * Manual equivalent: create `Trips/Lisbon/` with two notes, link to both from another note, close Obsidian, and
 * rename the folder to `Lisbon 2024` in your file manager.
 */
export async function createRenamedFolderDemo(app: App): Promise<void> {
  await resetBrokenLinksDemo(app);
  await app.vault.createFolder(`${BROKEN_LINKS_FOLDER_PATH}/Trips/Lisbon`);
  await app.vault.create(`${BROKEN_LINKS_FOLDER_PATH}/Trips/Lisbon/Itinerary.md`, '# Itinerary\n\nDay 1: the old town.\n');
  await app.vault.create(`${BROKEN_LINKS_FOLDER_PATH}/Trips/Lisbon/Packing list.md`, '# Packing list\n\n- Sunscreen\n');
  await app.vault.create(
    `${BROKEN_LINKS_FOLDER_PATH}/Travel log.md`,
    [
      '# Travel log',
      '',
      '- [Itinerary](<Trips/Lisbon/Itinerary.md>)',
      '- [[Trips/Lisbon/Packing list.md|What to pack]]',
      '- [Visa scan](<Trips/Lisbon/Visa.pdf>) - this one never existed, so nothing can be suggested for it.',
      ''
    ].join('\n')
  );

  const folder = app.vault.getFolderByPath(`${BROKEN_LINKS_FOLDER_PATH}/Trips/Lisbon`);
  if (folder) {
    await app.vault.rename(folder, `${BROKEN_LINKS_FOLDER_PATH}/Trips/Lisbon 2024`);
  }
  new Notice('Renamed Trips/Lisbon to Trips/Lisbon 2024 without updating links.');
}

/**
 * Runs **Fix broken links** and returns once its view is showing.
 *
 * Manual equivalent: run **Fix broken links** from the Command Palette.
 */
export async function openFixBrokenLinks(app: App): Promise<void> {
  runCommand(app, 'fix-broken-links');
  const deadline = Date.now() + BROKEN_LINKS_VIEW_TIMEOUT_IN_MILLISECONDS;
  while (app.workspace.getLeavesOfType(BROKEN_LINKS_VIEW_TYPE).length === 0) {
    if (Date.now() > deadline) {
      throw new Error(`The Fix broken links view did not open within ${String(BROKEN_LINKS_VIEW_TIMEOUT_IN_MILLISECONDS)} ms.`);
    }
    await sleep(CONSISTENCY_REPORT_POLL_INTERVAL_IN_MILLISECONDS);
  }
}

/**
 * Deletes what {@link createRenamedFolderDemo} created.
 *
 * Manual equivalent: delete the `Materials/09 Fix broken links` folder.
 */
export async function resetBrokenLinksDemo(app: App): Promise<void> {
  const folder = app.vault.getFolderByPath(BROKEN_LINKS_FOLDER_PATH);
  if (folder) {
    await app.fileManager.trashFile(folder);
  }
}