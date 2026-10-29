/**
 * @file
 *
 * The corpus of the `integration-tests:desktop-performance` project: `@mnaoumov/obsidian-dev-toolkit`'s
 * 37,000-note performance vault, plus notes that embed attachments, which that vault has none of.
 *
 * `Check vault consistency` spends nearly all of its time asking the attachment-path seam about attachment
 * references, so a corpus without them would time the walk and nothing else. Each attachment note embeds
 * {@link ATTACHMENT_NOTE_HOME_EMBED_COUNT} attachments under its own `./!!files/<note>/` folder and
 * {@link ATTACHMENT_NOTE_EXTERNAL_EMBED_COUNT} under a shared folder elsewhere, so a stand-in for `Custom
 * Attachment Location` that answers `./!!files/<note>/` finds both shapes: references at home and references
 * the report must name.
 */

import type { PopulateFilesParams } from 'obsidian-integration-testing';

import { generatePerformanceVault } from '@mnaoumov/obsidian-dev-toolkit/test-runners/performance-vault';

/**
 * Markdown notes in the toolkit's corpus, its own fixtures included. The toolkit's default, restated so the
 * expected file count below needs no 110 MB corpus generated just to count it.
 */
export const PERFORMANCE_VAULT_NOTE_COUNT = 37_000;

/**
 * Folder holding the attachment notes and, under `!!files/`, their own attachments.
 */
export const ATTACHMENT_NOTE_FOLDER = 'attachment-notes';

/**
 * Folder holding the attachments every attachment note embeds from outside its own folder.
 */
export const EXTERNAL_ATTACHMENT_FOLDER = 'external-attachments';

/**
 * How many attachment notes are generated.
 */
export const ATTACHMENT_NOTE_COUNT = 400;

/**
 * Attachments each note embeds from its own `./!!files/<note>/` folder.
 */
export const ATTACHMENT_NOTE_HOME_EMBED_COUNT = 3;

/**
 * Attachments each note embeds from {@link EXTERNAL_ATTACHMENT_FOLDER}.
 */
export const ATTACHMENT_NOTE_EXTERNAL_EMBED_COUNT = 2;

/**
 * Attachment references in the whole corpus: the toolkit's vault has none.
 */
export const ATTACHMENT_REFERENCE_COUNT = ATTACHMENT_NOTE_COUNT * (ATTACHMENT_NOTE_HOME_EMBED_COUNT + ATTACHMENT_NOTE_EXTERNAL_EMBED_COUNT);

/**
 * References the report must name as misplaced: every external one.
 */
export const EXTERNAL_ATTACHMENT_REFERENCE_COUNT = ATTACHMENT_NOTE_COUNT * ATTACHMENT_NOTE_EXTERNAL_EMBED_COUNT;

/**
 * Every file in the vault once Obsidian has scanned it: the toolkit's notes, the attachment notes, and one
 * file per attachment reference, since no two references share an attachment.
 */
export const PERFORMANCE_VAULT_FILE_COUNT = PERFORMANCE_VAULT_NOTE_COUNT + ATTACHMENT_NOTE_COUNT + ATTACHMENT_REFERENCE_COUNT;

/**
 * A toolkit note whose metadata is ready only once the startup scan has reached it.
 */
export const PERFORMANCE_VAULT_CACHE_PATH = 'links/link-0.md';

const ATTACHMENT_SIZE_IN_BYTES = 4;
const ATTACHMENT_BYTES = new Uint8Array(ATTACHMENT_SIZE_IN_BYTES).fill(1);

/**
 * The vault-relative path of an attachment note.
 *
 * @param index - The note index.
 * @returns The note path.
 */
export function attachmentNotePath(index: number): string {
  return `${ATTACHMENT_NOTE_FOLDER}/${attachmentNoteBaseName(index)}.md`;
}

/**
 * Builds the corpus, written to disk before Obsidian opens the vault so its startup scan indexes it in one pass.
 *
 * @returns Vault-relative paths mapped to content.
 */
export function generateConsistencyPerformanceVault(): PopulateFilesParams {
  const files: PopulateFilesParams = generatePerformanceVault({ noteCount: PERFORMANCE_VAULT_NOTE_COUNT });

  for (let noteIndex = 0; noteIndex < ATTACHMENT_NOTE_COUNT; noteIndex++) {
    const baseName = attachmentNoteBaseName(noteIndex);
    let content = '';

    // Relative markdown embeds, which the report resolves literally, so every one of them reaches the seam.
    for (let embedIndex = 0; embedIndex < ATTACHMENT_NOTE_HOME_EMBED_COUNT; embedIndex++) {
      const fileName = `home-${String(embedIndex)}.png`;
      files[`${ATTACHMENT_NOTE_FOLDER}/!!files/${baseName}/${fileName}`] = ATTACHMENT_BYTES;
      content += `![](!!files/${baseName}/${fileName})\n`;
    }

    for (let embedIndex = 0; embedIndex < ATTACHMENT_NOTE_EXTERNAL_EMBED_COUNT; embedIndex++) {
      const fileName = `${baseName}-external-${String(embedIndex)}.png`;
      files[`${EXTERNAL_ATTACHMENT_FOLDER}/${fileName}`] = ATTACHMENT_BYTES;
      content += `![](../${EXTERNAL_ATTACHMENT_FOLDER}/${fileName})\n`;
    }

    files[attachmentNotePath(noteIndex)] = content;
  }

  return files;
}

function attachmentNoteBaseName(index: number): string {
  return `note-${String(index)}`;
}
