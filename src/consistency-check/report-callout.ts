/**
 * @file
 *
 * The shape every section of the consistency report shares: a heading that carries the section's totals, and
 * one collapsed callout per note (or per item, for path compatibility) holding that note's findings.
 *
 * One callout per note, never one per finding: a note with 160 findings used to repeat its own name on 160
 * lines. Collapsed, the report reads as a list of notes with their counts, and a note's findings are one click
 * away. The callout's title holds the note's link, which Obsidian renders clickable in a callout title.
 */

/**
 * The callout type every finding group uses.
 */
export const REPORT_CALLOUT_TYPE = 'warning';

/**
 * The total number of findings over every group of a section.
 *
 * @param groups - Each group's findings.
 * @returns The total.
 */
export function countFindings(groups: Iterable<readonly unknown[]>): number {
  let count = 0;
  for (const group of groups) {
    count += group.length;
  }
  return count;
}

/**
 * One collapsed callout: the title and the count on the first line, then each line quoted into the callout.
 *
 * Ends with a blank line, because two callouts with nothing between them are one callout to Obsidian.
 *
 * @param title - The callout's title, usually the note's link.
 * @param count - How many findings the group holds, all of them, listed or not.
 * @param lines - The lines inside the callout, each without the `> ` quote prefix.
 * @returns The callout's Markdown.
 */
export function formatReportCallout(title: string, count: number, lines: readonly string[]): string {
  return `> [!${REPORT_CALLOUT_TYPE}]- ${title} (${String(count)})\n${lines.map((line) => `> ${line}\n`).join('')}\n`;
}

/**
 * A section heading with its totals, for example `# Bad links (412 in 37 notes)`.
 *
 * @param title - The section's title.
 * @param findingCount - How many findings the section holds.
 * @param groupCount - How many notes (or items) they are in.
 * @param groupNoun - What a group is: `notes`, or `items` for path compatibility.
 * @returns The heading line, with its line break.
 */
export function formatReportHeading(title: string, findingCount: number, groupCount: number, groupNoun = 'notes'): string {
  return `# ${title} (${String(findingCount)} in ${String(groupCount)} ${groupNoun})\n`;
}
