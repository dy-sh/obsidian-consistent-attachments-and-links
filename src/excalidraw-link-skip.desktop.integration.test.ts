/**
 * @file
 *
 * Desktop integration suite for issue #151: the plugin's link-rewriting operations must SKIP files
 * treated as attachments (default `treatAsAttachmentExtensions = ['.excalidraw.md']`), so the
 * image wikilinks Excalidraw stores inside a `.excalidraw.md` are left untouched (converting them to
 * Markdown links breaks Excalidraw's embedded-image rendering).
 *
 * It drives the REAL user flow — the `Replace all wiki embeds with Markdown embeds` command over the
 * whole vault — against a vault holding a normal note and an `.excalidraw.md`, each with the SAME
 * `![[image]]` wikilink embed. After the command runs it asserts the normal note's embed WAS converted
 * to a Markdown embed (the flow really ran) while the `.excalidraw.md`'s embed is UNCHANGED.
 *
 * Desktop-only (per G47: the file name alone picks the project). No Android emulator is available in
 * this environment; the behavior itself is platform-agnostic, so this can become
 * `*.cross-platform.integration.test.ts` the day one is.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const REPLACE_WIKI_EMBEDS_COMMAND_ID = `${PLUGIN_ID}:replace-all-wiki-embeds-with-markdown-embeds`;
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;
describe('Link rewriting skips .excalidraw.md attachments (issue #151)', () => {
  it('converts a normal note wiki embed but leaves the .excalidraw.md wiki embed untouched', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: {
        commandId: REPLACE_WIKI_EMBEDS_COMMAND_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({
        app,
        commandId,
        lib: { waitUntil },
        waitTimeoutInMilliseconds
      }) {
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const imagePath = `excl-img-${stamp}.png`;
        const normalPath = `excl-normal-${stamp}.md`;
        const drawingPath = `excl-drawing-${stamp}.excalidraw.md`;
        const embed = `![[${imagePath}]]`;

        for (const path of [imagePath, normalPath, drawingPath]) {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

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

        // The flow really ran once the normal note's wiki embed became a Markdown embed.
        await waitUntil({
          message: 'normal note wiki embed was not converted to a Markdown embed',
          predicate: async () => {
            const content = await app.vault.read(normalFile);
            return !content.includes('![[') && content.includes('](');
          },
          timeoutInMilliseconds: waitTimeoutInMilliseconds
        });

        const normalContent = await app.vault.read(normalFile);
        const drawingContent = await app.vault.read(drawingFile);

        for (const path of [imagePath, normalPath, drawingPath]) {
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
      vaultPath: getTempVault().path
    });

    // The normal note's wiki embed was rewritten to a Markdown embed.
    expect(result.normalContent).not.toContain('![[');
    expect(result.normalContent).toContain('](');

    // The .excalidraw.md file's wiki embed is left exactly as it was (Excalidraw keeps rendering).
    expect(result.drawingContent).toBe(result.originalEmbed);
  });
});
