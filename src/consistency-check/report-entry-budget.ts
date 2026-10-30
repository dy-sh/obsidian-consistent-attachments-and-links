/**
 * @file
 *
 * The cap on how much one section of the consistency report lists.
 *
 * The report is a note, and Obsidian renders it whole. Measured 2026-10-29 on a 35,598-note vault whose
 * attachment setting was a placeholder and had no `Custom Attachment Location`: nearly every reference was
 * misplaced, the report came out at 27 MB, and opening it crashed the renderer every time. Obsidian reopens the
 * note at the next start, so the vault then crashed on opening too. Not opening the report would not help: the
 * restore at startup and a manual open still would. So the note itself is kept small, by listing at most
 * {@link MAX_REPORTED_ENTRIES_PER_SECTION} entries per section. The headings keep the true counts, and a capped
 * section ends with a line saying how many it left out.
 *
 * A constant, not a setting: no list longer than this is read entry by entry, and a section this long has
 * one cause worth fixing, not thousands of entries.
 */

import { t } from '@mnaoumov/obsidian-lib/i18n/i18n';

/**
 * The most entries one section lists: references for the link and misplaced-attachment sections, items for
 * path compatibility. About 250 KB of report in the worst case seen.
 */
export const MAX_REPORTED_ENTRIES_PER_SECTION = 1000;

/**
 * Counts what one section lists, and what it leaves out once the cap is reached.
 */
export class ReportEntryBudget {
  /**
   * Whether the cap is reached, so no further entry is listed.
   *
   * @returns `true` once the section has listed its last entry.
   */
  public get isExhausted(): boolean {
    return this.listedCount >= this.limit;
  }

  private listedCount = 0;

  private omittedCount = 0;

  public constructor(private readonly limit = MAX_REPORTED_ENTRIES_PER_SECTION) {}

  /**
   * The line that ends a capped section, or nothing when every entry was listed.
   *
   * @returns The line, with its trailing blank line.
   */
  public describeOmission(): string {
    return this.omittedCount === 0 ? '' : `${t(($) => $.report.truncated, { limit: String(this.limit), omittedCount: String(this.omittedCount) })}\n\n`;
  }

  /**
   * Records entries the section does not list.
   *
   * @param count - How many.
   */
  public omit(count = 1): void {
    this.omittedCount += count;
  }

  /**
   * Takes one entry: lists it while the cap allows, and counts it as left out after that.
   *
   * @returns `true` when the entry is to be listed.
   */
  public take(): boolean {
    if (this.isExhausted) {
      this.omittedCount++;
      return false;
    }

    this.listedCount++;
    return true;
  }
}
