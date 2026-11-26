/**
 * @file
 *
 * Per-character replacements for the forbidden characters `Fix incompatible paths` repairs, such as `:` to ` -`
 * or `?` to nothing, with the single `forbiddenCharacterReplacement` setting as the fallback for every character
 * that has no entry.
 *
 * They are applied BEFORE `repairName`, which then replaces whatever is left with the fallback. That needs no
 * change to the library: every replacement passes the same validation as the fallback, so `repairName` never
 * touches one, and the name it returns is the one a per-character `repairName` would.
 */

import type { PathCompatibilityPlatform } from '@mnaoumov/obsidian-lib/path-compatibility';

import {
  findPathCompatibilityViolations,
  getForbiddenCharacterReplacementValidationMessage,
  PathCompatibilityViolationType
} from '@mnaoumov/obsidian-lib/path-compatibility';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

/**
 * Parameters for {@link applyForbiddenCharacterReplacements}.
 */
export interface ApplyForbiddenCharacterReplacementsParams {
  /**
   * The name, or a part of it such as the basename or the extension.
   */
  readonly name: string;

  /**
   * The platforms whose rules are enforced. A character only they accept is left alone.
   */
  readonly platforms: readonly PathCompatibilityPlatform[];

  /**
   * The replacement for each character, from {@link parseForbiddenCharacterReplacements}.
   */
  readonly replacements: ReadonlyMap<string, string>;
}

/**
 * What separates the character from its replacement in one setting line.
 */
const SEPARATOR = '=';

interface ReplacementEntry {
  readonly character: string;
  readonly replacement: string;
}

/**
 * Replaces each character the enabled platforms (or Obsidian's links) forbid and the user gave a replacement for.
 *
 * Only a forbidden character is replaced, so an entry for `:` changes nothing while no enabled platform refuses
 * `:`, exactly as the fallback does.
 *
 * @param params - The name, the platforms and the replacements.
 * @returns The name with every mapped forbidden character replaced, unchanged when there is nothing to replace.
 */
export function applyForbiddenCharacterReplacements(params: ApplyForbiddenCharacterReplacementsParams): string {
  if (params.replacements.size === 0 || params.name === '') {
    return params.name;
  }

  const forbiddenCharacters = new Set<string>();

  for (
    const violation of findPathCompatibilityViolations({
      isFolder: false,
      maxVaultRootPathLength: 0,
      path: params.name,
      platforms: params.platforms
    })
  ) {
    if (violation.type !== PathCompatibilityViolationType.ForbiddenCharacter && violation.type !== PathCompatibilityViolationType.ObsidianForbiddenCharacter) {
      continue;
    }

    // The library sets `characters` on both character violation types.
    for (const character of ensureNonNullable(violation.characters)) {
      forbiddenCharacters.add(character);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Code points are the unit the library's forbidden-character sets match, and a grapheme cluster would hide a forbidden one inside it.
  return [...params.name].map((character) => forbiddenCharacters.has(character) ? params.replacements.get(character) ?? character : character).join('');
}

/**
 * Validates the per-character replacement lines.
 *
 * @param lines - The setting value, one `<character>=<replacement>` line each.
 * @returns A message naming the first invalid line, or an empty string when every line is valid.
 */
export function getForbiddenCharacterReplacementsValidationMessage(lines: readonly string[]): string {
  const seenCharacters = new Set<string>();

  for (const line of lines) {
    const entry = parseLine(line);

    if (entry === null) {
      return `"${line}" is not a <character>${SEPARATOR}<replacement> line, e.g. ":${SEPARATOR} -".`;
    }

    if (getForbiddenCharacterReplacementValidationMessage(entry.character) === '') {
      return `"${entry.character}" is allowed in a file name on every platform, so there is nothing to replace.`;
    }

    if (seenCharacters.has(entry.character)) {
      return `"${entry.character}" has more than one replacement.`;
    }

    seenCharacters.add(entry.character);

    const replacementMessage = getForbiddenCharacterReplacementValidationMessage(entry.replacement);

    if (replacementMessage !== '') {
      return `"${line}": ${replacementMessage}`;
    }
  }

  return '';
}

/**
 * Reads the per-character replacement lines into a map.
 *
 * A line that does not parse is skipped: the validator refuses it at the setting, so one can only arrive by a
 * hand-edited `data.json`, and a repair should not fail over it.
 *
 * @param lines - The setting value, one `<character>=<replacement>` line each.
 * @returns The replacement for each character. A later line for the same character is ignored.
 */
export function parseForbiddenCharacterReplacements(lines: readonly string[]): Map<string, string> {
  const replacements = new Map<string, string>();

  for (const line of lines) {
    const entry = parseLine(line);

    if (entry === null || replacements.has(entry.character)) {
      continue;
    }

    replacements.set(entry.character, entry.replacement);
  }

  return replacements;
}

/**
 * Splits one line at the first separator after its first code point.
 *
 * Everything after the separator is the replacement, verbatim: ` -` keeps its leading space, and nothing after it
 * means the character is deleted.
 *
 * @param line - The line.
 * @returns The entry, or `null` when the line is not one character, the separator and a replacement.
 */
function parseLine(line: string): null | ReplacementEntry {
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- The key is one code point, the same unit the replacement is applied by.
  const [character, separator, ...replacement] = [...line];

  return character === undefined || separator !== SEPARATOR ? null : { character, replacement: replacement.join('') };
}
