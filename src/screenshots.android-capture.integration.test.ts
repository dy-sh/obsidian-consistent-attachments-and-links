/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs (T461-P21),
 * driving a staged vault in Obsidian Mobile on a real Android emulator and
 * writing `images/screenshots/screenshot-mobile-N.png`.
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
 * THE OFFENDER IS THE INVERSE OF THE DESKTOP SUITE'S, AND IS STAGED DIFFERENTLY.
 * The capture host has to be able to CREATE the offending file. This leg captures
 * on the emulator's ext4, where the desktop suite's over-long name is exactly what
 * cannot exist — so the offender here is a name Windows forbids and Linux does
 * not, and the Windows rule is the one turned on. That also rules out
 * `vault.populate`: the staging vault is assembled on the WINDOWS host before
 * `syncToDevice`, which is the one machine that cannot write this name. So the
 * note is created through `app.vault.create` on the device instead, after the
 * sync. Do not move it back into `populate` — it will fail on the host, not here.
 *
 * Every command is the plugin's OWN command, run through the command palette's
 * id, and every claim is asserted against the vault afterwards: shot 2 asserts
 * the forbidden name is gone and the original survived in the note's frontmatter,
 * shot 3 asserts the attachment's path, shot 4 asserts the report names the
 * broken link. A command that silently did nothing cannot be shipped as one that
 * worked.
 *
 * Worth taking on a phone because that is where a vault most often stops being
 * portable: attachments pile up and the file tree is a drawer nobody opens. The
 * frames that are about WHERE a file sits open that drawer, which on a phone
 * takes three tricks — see `openNote`.
 *
 * There is no mobile equivalent of the desktop viewport override, so the capture
 * is always the device's own framebuffer — a dedicated `obsidian_screenshots`
 * AVD built at exactly 900x1600, so the frame already IS the store's size.
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
 * `App`, reduced to the font-size applier that `obsidian-typings` does not
 * declare. Setting `baseFontSize` alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize(this: void): void;
}

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

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
 * A name ext4 accepts and Windows does not — an MS-DOS device name, which Windows
 * still reserves and no Linux filesystem cares about. The repair de-reserves it by
 * appending `_`, so the tab and the file tree both show the change.
 *
 * NOT a forbidden CHARACTER, which is the obvious choice and does not work:
 * Obsidian's own `vault.create` rejects `\ / : * ? < > "` on every platform, and
 * `|`, `#`, `^`, `[` and `]` on top of that, so a name carrying one cannot be
 * staged here at all — measured, twice, before settling on this. Reserved names and
 * trailing dots or spaces are the only two Windows rules Obsidian does not also
 * enforce, and a trailing dot is invisible in a screenshot.
 */
const BAD_NAME = 'CON';
const BAD_NAME_NOTE_PATH = `${NOTES_FOLDER}/${BAD_NAME}.md`;

const REPORT_PATH = 'consistency-report.md';

/**
 * Base font size for the mobile shots.
 *
 * Below Obsidian's own 16px default: the screenshot AVD is a 450x800 dp screen,
 * on which a relative path in a link wraps mid-path at 16.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [`.obsidian/plugins/${PLUGIN_ID}/data.json`]: JSON.stringify({
      consistencyReportFile: REPORT_PATH,
      // Windows, not Android: the staged name is legal on the ext4 volume this
      // Capture runs on and illegal on the desktop the vault would sync to, which
      // Is the whole claim shots 1 and 2 make.
      shouldEnsurePathCompatibilityOnWindows: true,
      // The warning modal would otherwise sit over every frame, and the command
      // That raised it would still be awaiting an answer.
      shouldShowBackupWarning: false
    }),
    [ORIGINAL_ATTACHMENT_PATH]: '',
    [SUBJECT_NOTE_PATH]: buildSubjectNote()
  });

  // Written as bytes rather than through `populate`, which takes text.
  writeFileSync(join(vaultPath(), ORIGINAL_ATTACHMENT_PATH), await buildDiagram());

  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, badNameNotePath, fontSizeInPixels, lib: { waitUntil }, subjectNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(subjectNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // Created HERE and not in `populate`: the staging vault is assembled on the
      // Windows host, which is the one machine that cannot write this name.
      if (!app.vault.getFileByPath(badNameNotePath)) {
        await app.vault.create(badNameNotePath, '# A name no desktop will accept\n\nWindows has reserved this one for a serial port since MS-DOS.\n');
      }

      // The drawer's foot carries the vault switcher, which in a capture run
      // Shows the harness's generated `temp-vault-XXXXXX` name — a private-looking
      // String that belongs in no listing.
      //
      // The same rule hides notices. A Notice is not a modal, so the dismiss pass
      // Further down never reaches one, and the plugin's Advanced Rename and Delete
      // Handler suggestion lands over the link text these frames exist to show.
      // Staging `isAdvancedRenameAndDeleteHandlerSuggestionDeclined` in `data.json`
      // Does NOT stop it; hiding the container does, for every notice any plugin
      // Raises mid-run.
      const style = createEl('style');
      style.textContent = '.workspace-drawer-vault-switcher, .workspace-drawer-header-switcher, .notice-container, .notice { visibility: hidden; }';
      document.head.append(style);

      // Small enough that a four-level tree and a `../attachments/diagram.png`
      // Path both fit a 450dp screen without wrapping.
      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      // The plugin collects attachments into the folder OBSIDIAN is configured
      // To use, so the destination in shot 3 is this setting's doing.
      app.vault.setConfig('attachmentFolderPath', './assets');

      // Shot 3 moves an attachment a note still embeds, and Obsidian asks "Update
      // Links?" before it will. The prompt is a dialog, so it covers the frame AND
      // Blocks everything after it. The CDP transport writes this into `app.json`
      // Itself ("Enabled alwaysUpdateLinks — headless rename support"); the Appium
      // Transport does not, so the mobile leg has to set it here.
      app.vault.setConfig('alwaysUpdateLinks', true);

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
    input: { badNameNotePath: BAD_NAME_NOTE_PATH, fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, subjectNotePath: SUBJECT_NOTE_PATH },
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

describe('mobile store screenshots', () => {
  it('1 - a name the vault\'s other devices reject', async () => {
    const content = await openNote(SUBJECT_NOTE_PATH);
    // The name is legal here and only here: the file exists on this ext4 volume,
    // And the note links to it, so the frame shows both the offender and the link
    // That will have to follow it.
    expect(await listFiles()).toContain(BAD_NAME_NOTE_PATH);
    expect(content).toContain(BAD_NAME);
    await shoot(1, 'A name your other devices reject');
  });

  it('2 - repaired, with the original name kept', async () => {
    await runCommand('fix-incompatible-paths');

    const repairedPath = await waitForRepairedNote();
    // De-reserving the name is only half of it. The name a user chose is not
    // Disposable, so the repair puts it back into the note as `title` and an alias —
    // Which is what this frame is actually of, so the drawer stays SHUT: opened, it
    // Covers the left half of a 450dp screen and the frontmatter falls off the edge.
    const content = await openNote(repairedPath);
    expect(repairedPath).not.toBe(BAD_NAME_NOTE_PATH);
    expect(content).toContain(`title: ${BAD_NAME}`);
    await shoot(2, 'Repaired, with the original name kept');
  });

  it('3 - attachments collected into the note\'s own folder', async () => {
    await runCommand('collect-attachments-entire-vault');
    const paths = await waitForFile(COLLECTED_ATTACHMENT_PATH);
    expect(paths).toContain(COLLECTED_ATTACHMENT_PATH);
    expect(paths).not.toContain(ORIGINAL_ATTACHMENT_PATH);
    const content = await openNote(SUBJECT_NOTE_PATH, true);
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
 * on purpose — a link to the forbidden name, an embed of the attachment shot 3
 * collects, and a link to a note that does not
 * exist. The first is what shot 2 repairs, and it is here rather than only in the
 * file tree so the frame can show the link following the rename; the third is
 * what shot 4's report has to find.
 *
 * @returns The note's Markdown.
 */
function buildSubjectNote(): string {
  return [
    '# Meeting',
    '',
    `Agreed to follow [the review note](<${BAD_NAME}.md>) for the layout.`,
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
async function openNote(notePath: string, shouldShowTree = false): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, notePath: path, shouldShowTree: isTreeWanted }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

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

      // On a phone the tree lives in the left DRAWER, and getting it open takes
      // Three tricks, each of which looks like the others from outside:
      //
      // 1. `collapsed` LIES. After a file is opened the split reports `false`
      //    While the element is still `display: none`, and `expand()` is then a
      //    No-op that returns happily and shows nothing — so collapse first.
      // 2. `revealLeaf` must come AFTER the drawer is out: the drawer is tabbed,
      //    And an open drawer on the wrong tab lays the rows out at zero width,
      //    Which reads exactly like a drawer that never opened. Revealing first
      //    Leaves it shut.
      // 3. It SLIDES. A frame taken mid-animation is a black panel with the note
      //    Shoved off the right edge, so this waits for a row painted at a sane
      //    X — checking ALL rows, since Obsidian leaves detached zero-sized rows
      //    From earlier renders in the document.
      // Opened ONLY where the claim is about where a file sits. The drawer covers
      // Most of a phone screen, so opening it for a shot about link SYNTAX would
      // Bury the very text the caption is describing.
      if (isTreeWanted) {
        const DRAWER_ATTEMPTS = 6;
        const DRAWER_SETTLE_DELAY_IN_MILLISECONDS = 2500;
        const TOGGLE_DELAY_IN_MILLISECONDS = 500;

        function isDrawerOpen(): boolean {
          return [...document.querySelectorAll('.nav-files-container .tree-item-self')]
            .map((row) => row.getBoundingClientRect())
            .some((rect) => rect.width > 0 && rect.left >= 0);
        }

        let isOpen = false;
        for (let attempt = 0; attempt < DRAWER_ATTEMPTS && !isOpen; attempt++) {
          app.workspace.leftSplit.collapse();
          await sleep(TOGGLE_DELAY_IN_MILLISECONDS);
          app.workspace.leftSplit.expand();
          await sleep(DRAWER_SETTLE_DELAY_IN_MILLISECONDS);

          if (fileExplorerLeaf) {
            await app.workspace.revealLeaf(fileExplorerLeaf);
          }

          await sleep(DRAWER_SETTLE_DELAY_IN_MILLISECONDS);
          isOpen = isDrawerOpen();
        }

        if (!isOpen) {
          const drawer = document.querySelector('.workspace-drawer.mod-left');
          const display = drawer ? window.getComputedStyle(drawer).display : 'no-drawer';
          throw new Error(
            `The file drawer never finished opening. collapsed=${String(app.workspace.leftSplit.collapsed)} display=${display}`
          );
        }
      } else {
        app.workspace.leftSplit.collapse();
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
    input: { notePath, shouldShowTree },
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
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  // The AVD is 900x1600, so the device frame IS the store's size. Asserting it
  // Here is what keeps that true: run this against any other AVD and it fails
  // Loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
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
 * Waits for the repair to rename the forbidden-name note, and reports where it landed.
 *
 * The repaired name cannot be predicted here: the replacement character is the
 * plugin's to choose, and `renameSafe` may append a deduplication suffix on top.
 * So the note is found by the prefix that survives either way rather than by a
 * name this suite computes and would have to keep in step.
 *
 * @returns The repaired note's path, or the original one if the rename never happened.
 */
async function waitForRepairedNote(): Promise<string> {
  const ATTEMPTS = 20;
  const INTERVAL_IN_MILLISECONDS = 1500;

  const prefix = `${NOTES_FOLDER}/${BAD_NAME}`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const paths = await listFiles();
    const repairedPath = paths.find((path) => path.startsWith(prefix) && path !== BAD_NAME_NOTE_PATH);
    if (repairedPath) {
      return repairedPath;
    }

    await sleepInNode({ milliseconds: INTERVAL_IN_MILLISECONDS });
  }

  return BAD_NAME_NOTE_PATH;
}
