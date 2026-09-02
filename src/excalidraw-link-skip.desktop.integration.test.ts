/**
 * @file
 *
 * Desktop integration suite for issue #151: the plugin's link-rewriting operations must SKIP files
 * treated as attachments (default `treatAsAttachmentExtensions = ['.excalidraw.md']`), so the
 * image references Excalidraw stores inside a `.excalidraw.md` are left untouched (rewriting them
 * breaks Excalidraw's embedded-image rendering).
 *
 * It drives the REAL user flow — the `Convert all embed paths to relative` command over the whole
 * vault — against a vault holding a normal note and an `.excalidraw.md`, each with the SAME
 * `![[image]]` embed of a file OUTSIDE their folder. After the command runs it asserts the normal
 * note's embed WAS rewritten (the flow really ran) while the `.excalidraw.md`'s embed is UNCHANGED.
 *
 * Both notes live in a subfolder while the image sits at the vault root, because a relative-path
 * conversion is a no-op when everything is already in the same folder — with a flat vault the
 * "flow really ran" probe could never fire, and the suite would pass without testing anything.
 *
 * The command used to be `Replace all wiki embeds with Markdown embeds`, which T846 removed when
 * wikilink conversion moved to Better Markdown Links. The guarantee is unchanged: it is
 * `isTreatedAsAttachment` that is under test, and the path conversion honours it exactly as the
 * removed command did.
 *
 * Desktop-only (per G47: the file name alone picks the project). No Android emulator is available in
 * this environment; the behavior itself is platform-agnostic, so this can become
 * `*.cross-platform.integration.test.ts` the day one is.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const CONVERT_EMBED_PATHS_COMMAND_ID = `${PLUGIN_ID}:convert-all-embed-paths-to-relative`;
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
describe('Link rewriting skips .excalidraw.md attachments (issue #151)', () => {
  it('rewrites a normal note embed path but leaves the .excalidraw.md embed untouched', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        commandId,
        lib: { waitUntil },
        waitTimeoutInMilliseconds
      }) {
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folderPath = `excl-notes-${stamp}`;
        const imagePath = `excl-img-${stamp}.png`;
        const normalPath = `${folderPath}/excl-normal.md`;
        const drawingPath = `${folderPath}/excl-drawing.excalidraw.md`;
        const embed = `![[${imagePath}]]`;

        for (const path of [imagePath, normalPath, drawingPath, folderPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        await app.vault.createFolder(folderPath);
        await app.vault.createBinary(imagePath, new ArrayBuffer(4));
        const normalFile = await app.vault.create(normalPath, embed);
        const drawingFile = await app.vault.create(drawingPath, embed);

        // Wait for the embeds to be indexed so the operation has something to convert.
        await waitUntil({
          message: 'note embeds were not indexed',
          predicate: () =>
            (app.metadataCache.getFileCache(normalFile)?.embeds?.length ?? 0) > 0
            && (app.metadataCache.getFileCache(drawingFile)?.embeds?.length ?? 0) > 0,
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        app.commands.executeCommandById(commandId);

        // The flow really ran once the normal note's embed points up out of its folder.
        await waitUntil({
          message: 'normal note embed path was not rewritten',
          predicate: async () => {
            const content = await app.vault.read(normalFile);
            return content !== embed;
          },
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        const normalContent = await app.vault.read(normalFile);
        const drawingContent = await app.vault.read(drawingFile);

        for (const path of [imagePath, normalPath, drawingPath, folderPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        return {
          drawingContent,
          normalContent,
          originalEmbed: embed
        };
      },
      input: {
        commandId: CONVERT_EMBED_PATHS_COMMAND_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    // The normal note's embed was rewritten to a path that resolves from the note's own folder.
    expect(result.normalContent).not.toBe(result.originalEmbed);
    expect(result.normalContent).toContain('../');

    // The .excalidraw.md file's embed is left exactly as it was (Excalidraw keeps rendering).
    expect(result.drawingContent).toBe(result.originalEmbed);
  });
});
