/**
 * @file
 *
 * The plugin whose shared HTML index answers the report's `HTML problems` section.
 *
 * Only the subset this plugin reads is declared here. That plugin is an Obsidian plugin repo, not an npm package,
 * so its contract cannot be imported: the authoritative copy is `HtmlRange`, `HtmlDiagnostic` and
 * `getHtmlDiagnosticsSafe` in its own `api.d.ts`, published at contract version `1.15.0` (release 2.5.0).
 */

import type { Pos } from 'obsidian';

/**
 * The id of that plugin, as listed in Obsidian's community plugin registry.
 */
export const ADVANCED_METADATA_CACHE_PLUGIN_ID = 'advanced-metadata-cache';

/**
 * The first contract version that publishes the HTML diagnostics.
 */
export const ADVANCED_METADATA_CACHE_HTML_API_VERSION_RANGE = '^1.15.0';

/**
 * The consumed subset of that plugin's API.
 */
export interface AdvancedMetadataCacheHtmlApi {
  /**
   * Waits for startup reconciliation, then validates the note's indexed HTML through Obsidian's own sanitizer.
   * `null` means unavailable: the `HTML` module is off, the note is outside the index, or an edit is pending.
   * `[]` means a completed scan found nothing.
   */
  readonly getHtmlDiagnosticsSafe: (pathOrFile: string) => Promise<HtmlDiagnostic[] | null>;
}

/**
 * A diagnostic about one candidate tag, never an instruction to delete source.
 */
export interface HtmlDiagnostic {
  /**
   * `unknown` for native HTML the browser does not know, `sanitized` for a tag Obsidian's sanitizer changes or
   * removes. The two are independent: one tag can carry both.
   */
  readonly kind: 'sanitized' | 'unknown';

  /**
   * The exact tag and its original position.
   */
  readonly range: HtmlRange;
}

/**
 * An original source range; offsets and columns are UTF-16 and ends are exclusive.
 */
export interface HtmlRange {
  /**
   * The exact source slice, never rewritten or sanitized.
   */
  readonly html: string;

  /**
   * Whether this is a closing tag.
   */
  readonly isClosing: boolean;

  /**
   * Core's cached HTML block, or a lexical tag candidate.
   */
  readonly kind: 'block' | 'tag';

  /**
   * The namespace context the fragment was validated in.
   */
  readonly namespace: 'html' | 'mathml' | 'svg';

  /**
   * Original note positions.
   */
  readonly position: Pos;

  /**
   * Lowercase name for tags; `null` for blocks.
   */
  readonly tagName: null | string;
}
