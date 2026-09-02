/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs
 * (T461-P21), driving a staged vault in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * FOUR shots following the plugin's scope line — report strictly, repair
 * narrowly, never rewrite: a name the platforms this vault syncs to would
 * reject, that name repaired with the original kept, attachments collected into
 * the note's own folder, and a consistency report that names what is still
 * broken without touching anything.
 *
 * Shots 1 and 2 used to show a path rewritten to resolve from the note holding
 * it. T912 removed the commands that did it — rewriting a link's style is not
 * this plugin's job — so the pair moved onto the repair half of the scope line.
 * There used to be a fifth shot too, showing an attachment following its note
 * across a move; Advanced Rename and Delete Handler owns that since 4.0.0.
 *
 * WHY THE OFFENDER IS AN OVER-LONG NAME AND NOT A FORBIDDEN CHARACTER. The
 * capture host has to be able to CREATE the offending file, and Windows is the
 * strictest platform on characters — nothing it forbids can be created here at all.
 * The one gap that runs the other way is length, and it is not even the same
 * unit: the staged name is 143 UTF-16 units (fine on NTFS) and 263 UTF-8 bytes
 * (over the 255-byte per-name limit ext4 and APFS enforce). So the offender is a
 * long name, the Android rule is the one turned on, and the mobile suite — which
 * captures on ext4, where that name cannot exist — stages the inverse.
 *
 * Every command is the plugin's OWN command, run through the command palette's
 * id, and every claim is asserted against the vault afterwards: shot 2 asserts
 * the long name is gone and the original survived in the note's frontmatter,
 * shot 3 asserts the attachment's path, shot 4 asserts the report names the
 * broken link. A command that silently did nothing cannot be shipped as one
 * that worked.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { sleep as sleepInNode } from 'obsidian-dev-utils/async';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import sharp from 'sharp';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * A file-explorer row, reduced to the collapse toggle.
 */
interface CollapsibleFileItem {
  collapsed?: boolean;
  setCollapsed?(this: void, isCollapsed: boolean): Promise<void>;
}

/**
 * The file-explorer view, reduced to its rows.
 */
interface FileExplorerView {
  fileItems: Record<string, CollapsibleFileItem>;
}

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const PLUGIN_ID = 'consistent-attachments-and-links';

const NOTES_FOLDER = 'Notes';
const SUBJECT_NOTE_PATH = `${NOTES_FOLDER}/Meeting.md`;

/**
 * Where the attachment starts: one shared folder at the vault root, which is
 * Obsidian's own default and the arrangement the plugin exists to undo.
 */
const ORIGINAL_ATTACHMENT_PATH = 'attachments/diagram.png';
const COLLECTED_ATTACHMENT_PATH = `${NOTES_FOLDER}/assets/diagram.png`;

/**
 * A link to a note that does not exist, so shot 4's report has something true to
 * say. Without it the report reads "no problems found", which proves the command
 * runs but not that it is worth running.
 */
const MISSING_NOTE_NAME = 'Budget';

/**
 * 143 characters, 263 UTF-8 bytes: NTFS counts the 143 and accepts it, so this
 * suite can stage it, while every ext4 and APFS device the vault syncs to counts
 * the 263 and rejects it. Shots 1 and 2 are the two sides of that gap.
 *
 * Cyrillic rather than CJK, which the first version used. The capture host has no
 * CJK font, so `文` rendered as a row of tofu boxes and the frame read as mojibake
 * rather than as a long name. Latin-with-diacritics is the other candidate and is
 * worse: at ~1.1 bytes per character it needs over 230 characters to break 255
 * bytes, which pushes the whole path past Windows' 259-character limit and the
 * file cannot be created at all. Cyrillic is two bytes per character AND present
 * in the default Windows UI font, which is the only combination that satisfies
 * every constraint at once — do not "simplify" it back to ASCII.
 */
// Russian test fixture, not project vocabulary: seeding the dictionary with it would let a real typo through elsewhere. cspell:disable-next-line
const LONG_NAME = 'Заметки о встрече команды и решениях по проекту '.repeat(3).trim();
const LONG_NAME_NOTE_PATH = `${NOTES_FOLDER}/${LONG_NAME}.md`;

/**
 * The per-name limit ext4 and APFS enforce, in bytes. Asserted rather than
 * commented: an edit to {@link LONG_NAME} that drops it under the limit would
 * otherwise leave shot 1 captioned "a name your other devices reject" over a name
 * they accept perfectly well, and shot 2 waiting for a repair that never comes.
 */
const MAX_NAME_LENGTH_IN_BYTES = 255;

const REPORT_PATH = 'consistency-report.md';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  expect(Buffer.byteLength(LONG_NAME, 'utf-8')).toBeGreaterThan(MAX_NAME_LENGTH_IN_BYTES);

  const vault = getTemporaryVault();

  vault.populate({
    [`.obsidian/plugins/${PLUGIN_ID}/data.json`]: JSON.stringify({
      consistencyReportFile: REPORT_PATH,
      // Android, not Windows: the staged long name is legal on the NTFS volume this
      // Capture runs on and illegal on every device the vault would sync to, which
      // Is the whole claim shots 1 and 2 make.
      shouldEnsurePathCompatibilityOnAndroid: true,
      // The warning modal would otherwise sit over every frame, and the command
      // That raised it would still be awaiting an answer.
      shouldShowBackupWarning: false
    }),
    [LONG_NAME_NOTE_PATH]: '# A name no phone will accept\n\nThis file name is 143 characters, which is 263 bytes in UTF-8.\n',
    [ORIGINAL_ATTACHMENT_PATH]: '',
    [SUBJECT_NOTE_PATH]: buildSubjectNote()
  });

  // Written as bytes rather than through `populate`, which takes text.
  writeFileSync(join(vaultPath(), ORIGINAL_ATTACHMENT_PATH), await buildDiagram());

  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, subjectNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(subjectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // A Notice is not a modal, so the dismiss pass further down never reaches one,
      // And the plugin's Advanced Rename and Delete Handler suggestion lands in the
      // Top-right corner — directly over the link text these frames exist to show.
      // Staging `isAdvancedRenameAndDeleteHandlerSuggestionDeclined` in `data.json`
      // Does NOT stop it; hiding the container does, for every notice any plugin
      // Raises mid-run.
      const noticeStyle = createEl('style');
      noticeStyle.textContent = '.notice-container, .notice { visibility: hidden; }';
      document.head.append(noticeStyle);

      // Where a file sits is half of every claim here, so the tree stays open.
      app.workspace.leftSplit.expand();
      const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
      if (fileExplorerLeaf) {
        await app.workspace.revealLeaf(fileExplorerLeaf);
      }

      // The plugin collects attachments into the folder OBSIDIAN is configured
      // To use, so the destination in shot 3 is this setting's doing.
      app.vault.setConfig('attachmentFolderPath', './assets');

      // The two settings the plugin's own "Recommended Obsidian settings" note
      // Asks for. They decide what the plugin WRITES when it rewrites a link:
      // Left at Obsidian's defaults, collecting an attachment produces a bare
      // `diagram.png` that only Obsidian's search can resolve — the very thing
      // The listing claims to fix.
      app.vault.setConfig('useMarkdownLinks', true);
      app.vault.setConfig('newLinkFormat', 'relative');
      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { subjectNotePath: SUBJECT_NOTE_PATH },
    vaultPath: vaultPath()
  });

  // A SEPARATE closure, because one `evalInObsidian` call is one CDP
  // `Runtime.evaluate` and the transport caps it at 30 seconds.
  //
  // The reload is what makes the staged `data.json` real. The harness enables the
  // Plugin when it opens the vault — BEFORE this suite writes any settings — so
  // Without it the plugin runs on defaults, and its default is to show a backup
  // Warning modal that sits over every frame AND blocks the commands behind it
  // Until someone clicks OK. That modal is exactly what the first run shipped.
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId }) {
      const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;

      await app.plugins.disablePlugin(pluginId);
      await app.plugins.enablePlugin(pluginId);

      await waitUntil({
        message: 'the plugin to register its commands again',
        predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:check-consistency`),
        timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
      });

      // The warning the FIRST load raised is still on screen — reloading the
      // Plugin changes the setting, not the open dialog. It has to be dismissed
      // Or it covers every frame and, worse, the command that raised it is still
      // Awaiting the answer, so nothing the storyboard runs afterwards happens.
      const DISMISS_ATTEMPTS = 5;
      const DISMISS_DELAY_IN_MILLISECONDS = 500;
      for (let attempt = 0; attempt < DISMISS_ATTEMPTS; attempt++) {
        const button = document.querySelector('.modal-container button.mod-cta, .modal-container .modal-close-button');
        if (!(button instanceof HTMLElement)) {
          break;
        }

        button.click();
        await sleep(DISMISS_DELAY_IN_MILLISECONDS);
      }
    },
    input: { pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - a name the vault\'s other devices reject', async () => {
    const content = await openNote(SUBJECT_NOTE_PATH);
    // The name is legal here and only here: the file exists on this NTFS volume,
    // And the note links to it, so the frame shows both the offender and the link
    // That will have to follow it.
    expect(await listFiles()).toContain(LONG_NAME_NOTE_PATH);
    expect(content).toContain(LONG_NAME);
    await shoot(1, 'A name your other devices reject');
  });

  it('2 - repaired, with the original name kept', async () => {
    await runCommand('fix-incompatible-paths');

    const repairedPath = await waitForRepairedNote();
    // Shortening the name is only half of it. The name a user chose is not
    // Disposable, so the repair puts it back into the note as `title` and an
    // Alias — which is what this frame is actually of.
    const content = await openNote(repairedPath);
    expect(repairedPath).not.toBe(LONG_NAME_NOTE_PATH);
    expect(content).toContain(`title: ${LONG_NAME}`);
    expect(content).toContain(LONG_NAME);
    await shoot(2, 'Repaired, with the original name kept');
  });

  it('3 - attachments collected into the note\'s own folder', async () => {
    await runCommand('collect-attachments-entire-vault');
    const paths = await waitForFile(COLLECTED_ATTACHMENT_PATH);
    expect(paths).toContain(COLLECTED_ATTACHMENT_PATH);
    expect(paths).not.toContain(ORIGINAL_ATTACHMENT_PATH);
    const content = await openNote(SUBJECT_NOTE_PATH);
    // The move is only half of it: the embed has to point at where the file went.
    expect(content).toContain('assets/diagram.png');
    await shoot(3, 'Attachments collected beside their own note');
  });

  // There used to be a frame here showing an attachment following its note across a move. Advanced Rename
  // And Delete Handler owns that since 4.0.0, so this plugin can no longer show it — and a store screenshot
  // Of a feature it does not have is worse than one frame fewer.
  it('4 - what is still broken, without touching anything', async () => {
    await runCommand('check-consistency');
    const report = await openNote(REPORT_PATH);
    expect(report).toContain(MISSING_NOTE_NAME);
    await shoot(4, 'A report of every bad link, changing nothing');
  });
});

/**
 * Builds the image the staged note embeds.
 *
 * Drawn as shapes rather than text: sharp renders SVG text through whatever
 * fonts the host happens to have, so a captioned placeholder would look
 * different on another machine — or lose its caption entirely.
 *
 * @returns The PNG's bytes.
 */
async function buildDiagram(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220">
    <rect width="420" height="220" rx="10" fill="#f4f5f8"/>
    <rect x="30" y="34" width="120" height="52" rx="8" fill="#5a76b4"/>
    <rect x="270" y="34" width="120" height="52" rx="8" fill="#5a76b4"/>
    <rect x="150" y="58" width="120" height="4" fill="#8b9dc6"/>
    <rect x="150" y="140" width="120" height="52" rx="8" fill="#8b9dc6"/>
    <rect x="88" y="86" width="4" height="80" fill="#8b9dc6"/>
    <rect x="88" y="162" width="66" height="4" fill="#8b9dc6"/>
    <rect x="328" y="86" width="4" height="80" fill="#8b9dc6"/>
    <rect x="266" y="162" width="66" height="4" fill="#8b9dc6"/>
  </svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Builds the note every shot is framed on.
 *
 * Standard Markdown throughout, written the way Obsidian writes it. Three forms
 * on purpose — a link to the over-long name, an embed of the attachment that
 * shot 3 collects, and a link to a note that does not exist. The first is what
 * shot 2 repairs, and it is here rather than only in the file tree so the frame
 * can show the link following the rename; the third is what shot 4's report has
 * to find.
 *
 * @returns The note's Markdown.
 */
function buildSubjectNote(): string {
  return [
    '# Meeting',
    '',
    `Agreed to follow [the naming note](<${LONG_NAME}.md>) for the layout.`,
    '',
    '![diagram](attachments/diagram.png)',
    '',
    `Costs are still open — see [${MISSING_NOTE_NAME}](${MISSING_NOTE_NAME}.md).`,
    ''
  ].join('\n');
}

/**
 * Lists every file in the vault, so a shot can assert where a file ended up.
 *
 * @returns Every file path in the vault.
 */
async function listFiles(): Promise<string[]> {
  return await evalInObsidian({
    callback({ app }) {
      return app.vault.getFiles().map((file) => file.path);
    },
    vaultPath: vaultPath()
  });
}

/**
 * Opens a note in source mode, with the file tree fully expanded.
 *
 * Source mode throughout: the SYNTAX of the links is the subject, and reading
 * view renders exactly that away.
 *
 * @param notePath - Vault-relative path of the note.
 * @returns The note's Markdown.
 */
async function openNote(notePath: string): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, notePath: path }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // Let the previous shot's capture settle: the device-metrics override it
      // Sets and clears disturbs anything driven too soon afterwards.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const file = app.vault.getFileByPath(path);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${path}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await leaf.setViewState({
        state: { file: path, mode: 'source', source: true },
        type: 'markdown'
      });

      await waitUntil({
        message: 'the editor to render',
        predicate: () => Boolean(document.querySelector('.cm-content')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      // A folder the tree has not expanded is a folder the reader cannot see,
      // And every claim here is about where a file sits. Expanded on every shot,
      // Because the commands create folders that arrive collapsed.
      const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
      if (fileExplorerLeaf) {
        const view: unknown = fileExplorerLeaf.view;
        for (const item of Object.values((view as FileExplorerView).fileItems)) {
          if (item.collapsed === true) {
            await item.setCollapsed?.(false);
          }
        }
      }

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      // No shot may ship with a dialog over it. The plugin's backup warning is
      // The one that can appear here, and it did — silently, in every frame of an
      // Early run — so this fails the shot rather than photographing it.
      const modalCount = document.querySelectorAll('.modal-container').length;
      if (modalCount > 0) {
        const modalText = document.querySelector('.modal-container')?.textContent ?? '';
        throw new Error(`A dialog is covering the frame: ${modalText.slice(0, 120)}`);
      }

      return await app.vault.read(file);
    },
    input: { notePath },
    vaultPath: vaultPath()
  });
}

/**
 * Runs one of the plugin's own commands and waits for it to finish.
 *
 * @param commandId - The command's id, without the plugin prefix.
 */
async function runCommand(commandId: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, commandId: id, pluginId }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 3000;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const fullId = `${pluginId}:${id}`;
      if (!Object.hasOwn(app.commands.commands, fullId)) {
        throw new Error(`No such command: ${fullId}`);
      }

      // NOT awaited: several of these commands ask a question first and only
      // Resolve once it is answered, so awaiting here would deadlock against the
      // Click below.
      app.commands.executeCommandById(fullId);

      // "Do you want to collect attachments for all notes in folders
      // Recursively?" — the destructive commands confirm before they touch
      // Anything, and until that is answered the command has done nothing at all.
      // This is what an unattended run has to say yes to.
      const CONFIRM_ATTEMPTS = 10;
      const CONFIRM_DELAY_IN_MILLISECONDS = 500;
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
        const confirmButton = document.querySelector('.modal-container button.mod-cta');
        if (confirmButton instanceof HTMLElement) {
          confirmButton.click();
          break;
        }

        await sleep(CONFIRM_DELAY_IN_MILLISECONDS);
      }

      // These commands walk the whole vault through an internal queue, so the
      // Wait is for the work rather than for the call.
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { commandId, pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

async function waitForFile(path: string): Promise<string[]> {
  const ATTEMPTS = 20;
  const INTERVAL_IN_MILLISECONDS = 1500;

  let paths: string[] = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    paths = await listFiles();
    if (paths.includes(path)) {
      return paths;
    }

    await sleepInNode({ milliseconds: INTERVAL_IN_MILLISECONDS });
  }

  return paths;
}

/**
 * Waits, from the Node side, for a file to appear at a path.
 *
 * The plugin's commands hand their work to an internal queue and return
 * immediately, so "the command ran" and "the vault changed" are separate events.
 * Polled from here rather than inside one closure because a whole-vault walk can
 * outlast the transport's per-call cap.
 *
 * @param path - The path the file should end up at.
 * @returns Every file path in the vault once it does.
 */
/**
 * Waits for the repair to rename the over-long note, and reports where it landed.
 *
 * The repaired name cannot be predicted here: `repairName` cuts by code point to
 * fit 255 BYTES, and `renameSafe` may append a deduplication suffix on top. So the
 * note is found by the prefix that survives either way rather than by a name this
 * suite computes and would have to keep in step.
 *
 * @returns The repaired note's path, or the original one if the rename never happened.
 */
async function waitForRepairedNote(): Promise<string> {
  const ATTEMPTS = 20;
  const INTERVAL_IN_MILLISECONDS = 1500;

  const prefix = `${NOTES_FOLDER}/${LONG_NAME.slice(0, 20)}`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const paths = await listFiles();
    const repairedPath = paths.find((path) => path.startsWith(prefix) && path !== LONG_NAME_NOTE_PATH);
    if (repairedPath) {
      return repairedPath;
    }

    await sleepInNode({ milliseconds: INTERVAL_IN_MILLISECONDS });
  }

  return LONG_NAME_NOTE_PATH;
}
