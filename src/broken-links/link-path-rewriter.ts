/**
 * @file
 *
 * Replaces the path inside a link's text and nothing else.
 *
 * A broken-link fix repairs where a link leads; it does not restyle the link. So a wikilink stays a wikilink,
 * a relative path stays relative, an angle-bracketed or percent-encoded destination keeps its form, and the
 * subpath, the alias and any title are kept byte for byte. `@mnaoumov/obsidian-lib`'s `updateLink` is not used
 * here because it regenerates the whole link through Obsidian's link settings, which is exactly the rewrite the
 * scope line forbids.
 */

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

import { getParentPath } from './broken-link-candidates.ts';

/**
 * The parameters for {@link computeNewLinkPath}.
 */
export interface ComputeNewLinkPathParams {
  /**
   * The path the link is written with now, without its subpath.
   */
  readonly oldLinkPath: string;

  /**
   * The path of the note holding the link.
   */
  readonly sourcePath: string;

  /**
   * The vault path the link must lead to.
   */
  readonly targetPath: string;
}

const WIKILINK_PATH_REGEXP = /^(?<Prefix>!?\[\[)(?<Path>[^#|\]]*)/;

/**
 * The path to write in a link so that, read literally the way the consistency check reads it, it leads to the
 * target.
 *
 * @param params - The parameters.
 * @returns A vault-absolute path when the old one started with `/`; otherwise a path relative to the note,
 * keeping a leading `./` when the old one had it.
 */
export function computeNewLinkPath(params: ComputeNewLinkPathParams): string {
  const { oldLinkPath, sourcePath, targetPath } = params;

  if (oldLinkPath.startsWith('/')) {
    return `/${targetPath}`;
  }

  const fromSegments = getParentPath(sourcePath).split('/').filter(Boolean);
  const toSegments = targetPath.split('/');
  let commonLength = 0;
  while (commonLength < fromSegments.length && commonLength < toSegments.length - 1 && fromSegments[commonLength] === toSegments[commonLength]) {
    commonLength++;
  }

  const relativePath = [...Array.from({ length: fromSegments.length - commonLength }, () => '..'), ...toSegments.slice(commonLength)].join('/');
  return oldLinkPath.startsWith('./') && !relativePath.startsWith('../') ? `./${relativePath}` : relativePath;
}

/**
 * Replaces the path in a link's text.
 *
 * @param linkText - The link as written: a wikilink, a markdown link, or a bare path from a frontmatter value.
 * @param newPath - The new path, unencoded.
 * @returns The link text with only its path replaced. Text that is neither a wikilink nor a markdown link is read as a
 * bare path, replaced up to its subpath.
 */
export function replaceLinkPath(linkText: string, newPath: string): string {
  const wikilinkMatch = WIKILINK_PATH_REGEXP.exec(linkText);
  if (wikilinkMatch?.groups) {
    const prefix = ensureNonNullable(wikilinkMatch.groups['Prefix']);
    const oldPath = ensureNonNullable(wikilinkMatch.groups['Path']);
    return prefix + newPath + linkText.slice(prefix.length + oldPath.length);
  }

  const destinationStart = findMarkdownLinkDestinationStart(linkText);
  if (destinationStart === -1) {
    const subpathStart = linkText.indexOf('#');
    return newPath + (subpathStart === -1 ? '' : linkText.slice(subpathStart));
  }

  if (linkText[destinationStart] === '<') {
    const pathStart = destinationStart + 1;
    const pathEnd = findFirstOf(linkText, '#>', pathStart);
    return linkText.slice(0, pathStart) + newPath + linkText.slice(pathEnd);
  }

  const pathEnd = findFirstOf(linkText, '# )', destinationStart);
  const oldPath = linkText.slice(destinationStart, pathEnd);
  return linkText.slice(0, destinationStart) + encodeMarkdownLinkPath(newPath, oldPath.includes('%')) + linkText.slice(pathEnd);
}

/**
 * Encodes a path for a markdown link destination with no angle brackets.
 *
 * @param path - The path.
 * @param shouldEncodeFully - Whether the old destination was percent-encoded, so the new one is too. Otherwise
 * only the characters that would end the destination are encoded, so a path written with plain Unicode keeps it.
 * @returns The encoded path.
 */
function encodeMarkdownLinkPath(path: string, shouldEncodeFully: boolean): string {
  const encoded = shouldEncodeFully ? encodeURI(path) : path.replaceAll('%', '%25').replaceAll(' ', '%20');
  return encoded.replaceAll('#', '%23').replaceAll('(', '%28').replaceAll(')', '%29');
}

function findFirstOf(text: string, chars: string, start: number): number {
  for (let index = start; index < text.length; index++) {
    if (chars.includes(text.charAt(index))) {
      return index;
    }
  }
  return text.length;
}

/**
 * Finds where a markdown link's destination starts: just after the `](` that closes its text.
 *
 * @param linkText - The link text.
 * @returns The index, or `-1` when the text is not a markdown link.
 */
function findMarkdownLinkDestinationStart(linkText: string): number {
  let index = linkText.startsWith('!') ? 1 : 0;
  if (linkText[index] !== '[') {
    return -1;
  }

  let depth = 0;
  for (; index < linkText.length; index++) {
    const char = linkText[index];
    switch (char) {
      case '[': {
        depth++;

        break;
      }
      case ']': {
        depth--;
        if (depth === 0) {
          return linkText[index + 1] === '(' ? index + ']('.length : -1;
        }

        break;
      }
      case '\\': {
        index++;

        break;
      }
        // No default
    }
  }

  return -1;
}
