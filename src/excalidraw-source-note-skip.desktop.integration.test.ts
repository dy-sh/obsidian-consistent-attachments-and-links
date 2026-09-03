/**
 * @file
 *
 * Desktop integration suite for the OTHER direction of `treatAsAttachmentExtensions` (default
 * `['.excalidraw.md']`): a file listed there is never scanned as a SOURCE note, so whatever is written
 * inside it is left exactly as it is.
 *
 * That is issue #151's actual guarantee. Excalidraw stores each drawing's embedded-image references
 * inside the `.excalidraw.md` itself, and rewriting them stops the drawing rendering. Collecting is now
 * the only operation in the plugin that rewrites a link at all — `LinksHandler`'s rewriting half left
 * under T912 — so the guarantee lives entirely in the collector's walk
 * (`attachment-collector.ts:collectAttachmentsInAbstractFilesImpl`), which selects notes with
 * `isNoteEx` rather than obsidian-dev-utils' plain extension-based `isNote`. Before T919-P22 it used
 * `isNote`, and a drawing WAS scanned, moved and rewritten; that was measured against a real Obsidian,
 * not read off the source.
 *
 * There is no third option to design here: collecting an attachment is a move plus a rewrite of the
 * referencing file, so a drawing whose own attachments moved would necessarily have been rewritten.
 * Skipping it as a source note is the whole behavior.
 *
 * The suite drives the REAL user flow — `Collect attachments in current folder`, from an ordinary
 * sibling note, over a folder holding both that note and a drawing — and runs it TWICE. The control
 * phase empties the setting, so the drawing reads as an ordinary note and its image DOES travel; the
 * fix phase restores the default and only the sibling's image travels. Without the control phase this
 * would pass whenever the collect silently did nothing.
 *
 * The sibling note's own image is asserted in both phases, so a run where the collect never happened
 * fails loudly rather than reading as "the drawing was correctly skipped". Each phase also probes the
 * command handler's half of the fix, by asking `Collect attachments in current note` whether it is
 * available with the drawing active: offered in the control phase, refused in the fix phase, rather
 * than being offered and then silently doing nothing. That is `checkCallback(true)` — the same question
 * Obsidian asks before listing a command — so the probe moves nothing and the folder collect stays the
 * only thing that touches a file.
 *
 * Collecting anything other than a single file confirms first, and nothing else in the harness answers
 * that modal, so the suite clicks its OK button — the one in the container that APPEARED, not the first
 * `.mod-cta` in the document, since the shared desktop vault may already be showing a modal of its own.
 * Both mistakes look identical from outside: the operation parks in the plugin's queue, and every later
 * suite's collect is swallowed behind it.
 *
 * The opposite direction — a drawing REFERENCED by a note travels as that note's attachment — is
 * covered by `excalidraw-attachment-collecting.desktop.integration.test.ts`.
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
const COLLECT_IN_FILE_COMMAND_ID = `${PLUGIN_ID}:collect-attachments-in-file`;
const COLLECT_IN_FOLDER_COMMAND_ID = `${PLUGIN_ID}:collect-attachments-in-current-folder`;
const WAIT_TIMEOUT_IN_MILLISECONDS = 20_000;

interface PhaseResult {
  readonly isDrawingContentUnchanged: boolean;
  readonly isDrawingImageCollected: boolean;
  readonly isFileCommandOfferedOnDrawing: boolean;
  readonly isSiblingImageCollected: boolean;
}

interface ProbeResult {
  readonly control: PhaseResult;
  readonly fix: PhaseResult;
  readonly settingsFound: boolean;
}

describe('A .excalidraw.md is never scanned as a source note', () => {
  it('leaves a drawing and its own attachment alone only while its extension is treated as an attachment', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        collectInFileCommandId,
        collectInFolderCommandId,
        lib: { waitUntil },
        pluginId,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        interface AttachmentExtensionSettings {
          isTreatedAsAttachment(path: string): boolean;
          treatAsAttachmentExtensions: string[];
        }

        interface AvailabilityCheckableCommand {
          checkCallback?(isChecking: boolean): boolean | undefined;
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

        const EMPTY_PHASE: PhaseResult = {
          isDrawingContentUnchanged: false,
          isDrawingImageCollected: false,
          isFileCommandOfferedOnDrawing: false,
          isSiblingImageCollected: false
        };

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
         * Stages a scanned folder holding a drawing and an ordinary sibling note, each embedding its own
         * image from a folder OUTSIDE the scanned one, so a collect has somewhere to move them from.
         */
        async function runPhase(shouldTreatDrawingAsAttachment: boolean): Promise<PhaseResult> {
          const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
          const properFolder = `excl-src-proper-${stamp}`;
          const scanFolder = `excl-src-scan-${stamp}`;
          const outsideFolder = `excl-src-out-${stamp}`;
          const drawingImagePath = `${outsideFolder}/excl-src-drawing-image-${stamp}.png`;
          const siblingImagePath = `${outsideFolder}/excl-src-sibling-image-${stamp}.png`;
          const drawingPath = `${scanFolder}/excl-src-drawing-${stamp}.excalidraw.md`;
          const siblingPath = `${scanFolder}/excl-src-sibling-${stamp}.md`;
          const drawingContent = `# drawing\n\n![[${drawingImagePath}]]\n`;

          try {
            vaultConfig.setConfig('attachmentFolderPath', properFolder);
            settings.treatAsAttachmentExtensions = shouldTreatDrawingAsAttachment ? ['.excalidraw.md'] : [];

            await app.vault.createFolder(properFolder).catch(() => undefined);
            await app.vault.createFolder(scanFolder);
            await app.vault.createFolder(outsideFolder);
            await app.vault.createBinary(drawingImagePath, new ArrayBuffer(4));
            await app.vault.createBinary(siblingImagePath, new ArrayBuffer(4));
            const drawing = await app.vault.create(drawingPath, drawingContent);
            const sibling = await app.vault.create(siblingPath, `![[${siblingImagePath}]]\n`);

            await waitUntil({
              message: 'the staged embeds were not indexed',
              predicate: () =>
                (app.metadataCache.getFileCache(drawing)?.embeds?.length ?? 0) > 0
                && (app.metadataCache.getFileCache(sibling)?.embeds?.length ?? 0) > 0,
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            // The command-handler half: with the drawing active, `Collect attachments in current note`
            // Is offered only while the drawing counts as a note. `checkCallback(true)` is the availability
            // Probe Obsidian itself uses to decide whether to list the command, so this asks the question
            // Without running anything — leaving the folder collect below as the only thing that moves a file.
            await app.workspace.getLeaf(false).openFile(drawing);
            const fileCommandUnknown: unknown = app.commands.commands[collectInFileCommandId];
            const fileCommand = fileCommandUnknown as AvailabilityCheckableCommand | undefined;
            const isFileCommandOfferedOnDrawing = fileCommand?.checkCallback?.(true) === true;

            // The walk half: collecting the folder reaches the drawing and the sibling alike.
            const modalCountBefore = document.querySelectorAll('.modal-container').length;
            await app.workspace.getLeaf(false).openFile(sibling);
            app.commands.executeCommandById(collectInFolderCommandId);

            /*
             * Collecting anything other than a single file confirms first, and nothing else in the harness
             * answers that modal — leave it and the operation sits in the plugin's queue, swallowing every
             * later suite's collect too. Wait for a NEW container and click the topmost one: the shared
             * desktop vault can already be showing a modal of its own (the plugin's own backup warning is
             * one), and clicking the first `.mod-cta` in the document dismisses that instead, which is
             * indistinguishable from the collect having silently done nothing.
             */
            await waitUntil({
              message: 'the collect confirmation modal never appeared',
              predicate: () => document.querySelectorAll('.modal-container').length > modalCountBefore,
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });
            const confirmButton = [...document.querySelectorAll('.modal-container')].at(-1)?.querySelector('button.mod-cta');
            if (confirmButton instanceof HTMLElement) {
              confirmButton.click();
            }

            // The sibling's image travels in BOTH phases, so it is the signal that the collect ran at all.
            await waitUntil({
              message: 'the sibling note\'s image was not collected, so the flow never ran',
              predicate: () => Boolean(app.vault.getAbstractFileByPath(`${properFolder}/${siblingImagePath.split('/', 2)[1] ?? ''}`)),
              timeoutInMilliseconds: waitTimeoutInMilliseconds
            });

            const collectedPaths = app.vault.getFiles().map((file) => file.path).filter((path) => path.startsWith(`${properFolder}/`));
            return {
              isDrawingContentUnchanged: (await app.vault.read(drawing)) === drawingContent,
              isDrawingImageCollected: collectedPaths.some((path) => path.includes('-drawing-image-')),
              isFileCommandOfferedOnDrawing,
              isSiblingImageCollected: collectedPaths.some((path) => path.includes('-sibling-image-'))
            };
          } finally {
            // The desktop suite shares one vault, and the sibling suites enumerate it and assert on
            // Exactly which files survive. Take everything this phase created back out.
            const createdPaths = app.vault.getFiles().map((file) => file.path).filter((filePath) => filePath.includes(stamp)).reverse();
            for (const createdPath of createdPaths) {
              await trashIfExists(createdPath);
            }
            await trashIfExists(scanFolder);
            await trashIfExists(outsideFolder);
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
        collectInFileCommandId: COLLECT_IN_FILE_COMMAND_ID,
        collectInFolderCommandId: COLLECT_IN_FOLDER_COMMAND_ID,
        pluginId: PLUGIN_ID,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    // A settings object that could not be found would make every assertion below vacuous.
    expect(result.settingsFound).toBe(true);

    // Both phases really collected, so the difference between them is the setting and nothing else.
    expect(result.control.isSiblingImageCollected).toBe(true);
    expect(result.fix.isSiblingImageCollected).toBe(true);

    // Without the extension listed, the drawing is an ordinary note: its command is offered, its own
    // Attachment is collected, and the reference written inside it is rewritten to match.
    expect(result.control.isFileCommandOfferedOnDrawing).toBe(true);
    expect(result.control.isDrawingImageCollected).toBe(true);
    expect(result.control.isDrawingContentUnchanged).toBe(false);

    // With it listed, the drawing is an attachment: the command is refused rather than offered and then
    // Doing nothing, its attachment stays where it is, and its bytes are untouched (issue #151).
    expect(result.fix.isFileCommandOfferedOnDrawing).toBe(false);
    expect(result.fix.isDrawingImageCollected).toBe(false);
    expect(result.fix.isDrawingContentUnchanged).toBe(true);
  });
});
