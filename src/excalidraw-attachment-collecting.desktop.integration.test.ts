/**
 * @file
 *
 * Desktop integration suite for `treatAsAttachmentExtensions` (default `['.excalidraw.md']`): a file
 * listed there is Markdown on disk but is really an attachment, so a note that references one must
 * carry it along when its attachments are collected — instead of skipping it as if it were a note.
 *
 * It drives the REAL user flow — `Collect attachments in current note` on a note that references a
 * `.excalidraw.md` — and runs it TWICE. The control phase empties the setting, and the drawing stays
 * put because `isNoteEx` (`src/attachment-collector.ts:172`) then reads it as a note. The fix phase
 * restores the default and the drawing travels. Without the control phase a suite like this passes
 * whenever the collect works at all, proving nothing about the setting.
 *
 * TWO plain images are staged alongside and asserted in both phases, so a run where the collect simply
 * did not happen fails loudly rather than reading as "the drawing was correctly skipped". The second one
 * is placed AFTER the drawing link in the note on purpose, and is the suite's settle point: the collector
 * walks a note's references in DOCUMENT order (`getLinks` ends in `sortReferences`) and awaits each move
 * before starting the next, so the trailing image cannot land until the drawing's turn is over — moved in
 * the fix phase, skipped in the control phase. Waiting on the LEADING image alone is what failed once:
 * it lands before the drawing is touched, so the snapshot could read a fix-phase drawing whose move was
 * still in flight as "not collected", and a control-phase drawing the walk had not yet reached as
 * "correctly left alone" — a false pass in the other direction.
 *
 * WHAT THIS SUITE IS NOT. It covers ONE of the two directions, and only that one. It replaces
 * `excalidraw-link-skip.desktop.integration.test.ts`, which claimed issue #151 — "link-rewriting
 * operations must skip files treated as attachments", so the image references Excalidraw stores INSIDE
 * a `.excalidraw.md` are never rewritten. That suite drove `Convert all embed paths to relative`, which
 * was removed as out of scope, and the guarantee did NOT come along to collecting on its own: the
 * collector's walk selected notes with obsidian-dev-utils' plain extension-based `isNote`, so a
 * drawing was scanned as an ordinary note and what was written inside it WAS rewritten. That was fixed
 * by moving the walk onto `isNoteEx`, and
 * `excalidraw-source-note-skip.desktop.integration.test.ts` is the suite that covers it. Do not read
 * this one as covering it.
 *
 * Desktop-only (the file name alone picks the project). No Android emulator is available in
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
const COLLECT_IN_FILE_COMMAND_ID = `${PLUGIN_ID}:collect-attachments-in-file`;
/*
 * Under the transport's ~30s per-closure cap, not at it.
 * The closure runs `runPhase` TWICE - a control phase and a fix phase - and each run declares two
 * waits, so this one constant is charged FOUR times against the cap rather than the two that are
 * visible in the body: 20 000 ms of the 30 000 the transport allows.
 * Counting the waits rather than the call sites is how it last read as 24s while declaring 48s, and a
 * closure over the cap can only ever die as a bare transport timeout naming the harness rather than
 * the wait that overran.
 * Indexing a staged note and collecting two plain images both land in well under a second, so the
 * smaller ceiling costs nothing and a stall fails with the message that names it.
 * The constant feeds nothing but the closure's own input, so no Node-side wait sees it.
 */
const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

interface PhaseResult {
  readonly isDrawingCollected: boolean;

  /**
   * Whether BOTH staged plain images travel — the leading one, which proves the collect ran at all,
   * and the trailing one, which proves the walk got past the drawing link.
   */
  readonly isImageCollected: boolean;
}

interface ProbeResult {
  readonly control: PhaseResult;
  readonly fix: PhaseResult;
  readonly settingsFound: boolean;
}

describe('A .excalidraw.md travels as an attachment', () => {
  it('collects a referenced drawing only while its extension is treated as an attachment', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        collectCommandId,
        lib: { waitUntil },
        pluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface AttachmentExtensionSettings {
          isTreatedAsAttachment(path: string): boolean;
          treatAsAttachmentExtensions: string[];
        }

        interface VaultConfigAccess {
          getConfig(key: string): unknown;
          setConfig(key: string, value: unknown): void;
        }

        function isAttachmentExtensionSettings(value: unknown): value is AttachmentExtensionSettings {
          return typeof value === 'object' && value !== null
            && typeof (value as Record<string, unknown>)['isTreatedAsAttachment'] === 'function';
        }

        // The plugin does not expose its settings publicly, so locate the live settings object
        // (the one the attachment collector reads) by walking the plugin's component tree.
        function findSettings(): AttachmentExtensionSettings | null {
          const block = new Set(['app', 'containerEl', 'dom', 'metadataCache', 'plugins', 'vault', 'workspace']);
          const seen = new Set<unknown>();
          const queue: unknown[] = [app.plugins.getPlugin(pluginId)];
          let budget = 12_000;
          while (queue.length > 0 && budget-- > 0) {
            const current = queue.shift();
            if (current === null || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) {
              continue;
            }
            seen.add(current);
            const record = current as Record<string, unknown>;
            if (isAttachmentExtensionSettings(record['settings'])) {
              return record['settings'];
            }
            let values: unknown[] = [];
            if (Array.isArray(current)) {
              values = current;
            } else if (current instanceof Map) {
              values = [...current.values()];
            } else {
              for (const [key, value] of Object.entries(record)) {
                if (!block.has(key)) {
                  values.push(value);
                }
              }
            }
            for (const value of values) {
              if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
                queue.push(value);
              }
            }
          }
          return null;
        }

        const EMPTY_PHASE: PhaseResult = { isDrawingCollected: false, isImageCollected: false };

        const foundSettings = findSettings();
        if (!foundSettings) {
          return { control: EMPTY_PHASE, fix: EMPTY_PHASE, settingsFound: false };
        }
        // A narrowed `const` does not stay narrowed inside a function declaration below it.
        const settings: AttachmentExtensionSettings = foundSettings;

        const vaultUnknown: unknown = app.vault;
        const vaultConfig = vaultUnknown as VaultConfigAccess;
        const priorAttachmentFolder = vaultConfig.getConfig('attachmentFolderPath');
        const priorExtensions = settings.treatAsAttachmentExtensions;

        async function trashIfExists(path: string): Promise<void> {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }

        /*
         * Stages a note referencing a plain image, a drawing and a second plain image in that order, each
         * sitting outside the note's folder so the collect has somewhere to move them from. The order is
         * load-bearing: see the trailing-image paragraph in this file's header.
         */
        async function runPhase(shouldTreatDrawingAsAttachment: boolean): Promise<PhaseResult> {
          const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
          const properFolder = `excl-proper-${stamp}`;
          const sourceFolder = `excl-src-${stamp}`;
          const imagePath = `${sourceFolder}/excl-image-${stamp}.png`;
          const drawingPath = `${sourceFolder}/excl-drawing-${stamp}.excalidraw.md`;
          const trailingImagePath = `${sourceFolder}/excl-trailing-${stamp}.png`;
          const notePath = `excl-note-${stamp}.md`;

          /*
           * The single reading of what ended up in the proper folder. The wait below polls it and the
           * phase returns it, so the condition waited for and the result asserted on cannot disagree.
           */
          function readCollected(): PhaseResult {
            const collectedPaths = app.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith(`${properFolder}/`));
            return {
              isDrawingCollected: collectedPaths.some((path) => path.endsWith('.excalidraw.md')),
              isImageCollected: collectedPaths.some((path) => path.includes('-image-')) && collectedPaths.some((path) => path.includes('-trailing-'))
            };
          }

          try {
            vaultConfig.setConfig('attachmentFolderPath', properFolder);
            settings.treatAsAttachmentExtensions = shouldTreatDrawingAsAttachment ? ['.excalidraw.md'] : [];

            await app.vault.createFolder(properFolder).catch(() => undefined);
            await app.vault.createFolder(sourceFolder);
            await app.vault.createBinary(imagePath, new ArrayBuffer(4));
            await app.vault.create(drawingPath, '# drawing\n');
            await app.vault.createBinary(trailingImagePath, new ArrayBuffer(4));
            const note = await app.vault.create(notePath, `![[${imagePath}]]\n\n[[${drawingPath}]]\n\n![[${trailingImagePath}]]\n`);

            await waitUntil({
              message: 'the note references were not indexed',
              predicate: () => {
                const cache = app.metadataCache.getFileCache(note);
                return (cache?.embeds?.length ?? 0) > 1 && (cache?.links?.length ?? 0) > 0;
              },
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            await app.workspace.getLeaf(false).openFile(note);
            app.commands.executeCommandById(collectCommandId);

            /*
             * Both plain images travel in BOTH phases, so this is the signal that the collect ran at all —
             * and, because the trailing one sits after the drawing link, that the walk is already past the
             * drawing. Only then is the snapshot below a verdict on the drawing rather than on how far the
             * collect happened to have got.
             */
            await waitUntil({
              message: 'the plain images were not collected, so the collect never ran or never reached past the drawing',
              predicate: () => readCollected().isImageCollected,
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            return readCollected();
          } finally {
            // The desktop suite shares one vault, and the sibling suites enumerate it and assert on
            // Exactly which files survive. Take everything this phase created back out.
            const createdPaths = app.vault.getFiles().map((file) => file.path).filter((filePath) => filePath.includes(stamp)).reverse();
            for (const createdPath of createdPaths) {
              await trashIfExists(createdPath);
            }
            await trashIfExists(notePath);
            await trashIfExists(sourceFolder);
            await trashIfExists(properFolder);
          }
        }

        try {
          const control = await runPhase(false);
          const fix = await runPhase(true);
          return { control, fix, settingsFound: true };
        } finally {
          // eslint-disable-next-line require-atomic-updates -- Restoring a value captured before the awaits; nothing else in this vault writes it.
          settings.treatAsAttachmentExtensions = priorExtensions;
          vaultConfig.setConfig('attachmentFolderPath', priorAttachmentFolder);
        }
      },
      input: {
        collectCommandId: COLLECT_IN_FILE_COMMAND_ID,
        pluginId: PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    // A settings object that could not be found would make every assertion below vacuous.
    expect(result.settingsFound).toBe(true);

    // Both phases really collected — and got past the drawing link, the trailing image being the proof —
    // So the difference between them is the setting and nothing else.
    expect(result.control.isImageCollected).toBe(true);
    expect(result.fix.isImageCollected).toBe(true);

    // Without the extension listed, the drawing reads as a note and is left where it is.
    expect(result.control.isDrawingCollected).toBe(false);

    // With it listed, the drawing is an attachment and travels with the note that references it.
    expect(result.fix.isDrawingCollected).toBe(true);
  });
});
