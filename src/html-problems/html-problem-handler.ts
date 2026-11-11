/**
 * @file
 *
 * The report's `HTML problems` section: tags Obsidian does not know, and tags its sanitizer changes or removes
 * when it renders a note.
 *
 * Nothing here parses Markdown or HTML. `Advanced Metadata Cache` keeps one shared, persisted index of each note's
 * HTML candidates and validates them through Obsidian's own `sanitizeHTMLToDom`, so the verdict is the running
 * Obsidian's rather than a blacklist kept here, and a note whose content has not changed is not re-read. Without
 * that plugin, or with its opt-in `HTML` module off, the section says it did not check rather than reporting
 * nothing, because an empty section would read as a clean vault.
 *
 * It only reports. A candidate is lexical, so it can be a false positive in an unusual Markdown construct, and
 * deleting markup on a candidate's word would lose content.
 */

import type { App } from 'obsidian';

import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import { t } from '@mnaoumov/obsidian-lib/i18n/i18n';
import { generateMarkdownLink } from '@mnaoumov/obsidian-lib/link';
import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type {
  AdvancedMetadataCacheHtmlApi,
  HtmlDiagnostic
} from '../sibling-plugins/advanced-metadata-cache.ts';

import {
  countFindings,
  formatReportCallout,
  formatReportHeading
} from '../consistency-check/report-callout.ts';
import { ReportEntryBudget } from '../consistency-check/report-entry-budget.ts';
import {
  ADVANCED_METADATA_CACHE_HTML_API_VERSION_RANGE,
  ADVANCED_METADATA_CACHE_PLUGIN_ID
} from '../sibling-plugins/advanced-metadata-cache.ts';

interface HtmlProblemHandlerCheckParams {
  readonly htmlProblems: HtmlProblemCheckResult;
  readonly notePath: string;
}

interface HtmlProblemHandlerConstructorParams {
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

/**
 * The section's findings: diagnostics by note, and how many notes the provider could not answer for.
 */
export class HtmlProblemCheckResult extends Map<string, HtmlDiagnostic[]> {
  /**
   * How many notes the provider answered `null` for: its module is off, or the note is still being indexed.
   *
   * @returns The count.
   */
  public get uncheckedNoteCount(): number {
    return this._uncheckedNoteCount;
  }

  private _uncheckedNoteCount = 0;

  /**
   * @param api - The provider's API for the whole walk, or `null` when it is not there.
   */
  public constructor(public readonly api: AdvancedMetadataCacheHtmlApi | null) {
    super();
  }

  public add(notePath: string, diagnostics: readonly HtmlDiagnostic[]): void {
    if (diagnostics.length === 0) {
      return;
    }

    const sorted = [...diagnostics].sort((a, b) => a.range.position.start.offset - b.range.position.start.offset || a.kind.localeCompare(b.kind));
    this.set(notePath, [...(this.get(notePath) ?? []), ...sorted]);
  }

  public markUnchecked(): void {
    this._uncheckedNoteCount++;
  }

  public override toString(app: App, reportPath: string): string {
    const title = t(($) => $.htmlProblems.report.title);

    if (!this.api) {
      return `# ${title}\n${t(($) => $.htmlProblems.report.unavailable)}\n\n`;
    }

    const notChecked = this._uncheckedNoteCount === 0
      ? ''
      : `${t(($) => $.htmlProblems.report.notChecked, { noteCount: String(this._uncheckedNoteCount) })}\n\n`;

    if (this.size === 0) {
      return `# ${title}\n${t(($) => $.htmlProblems.report.noProblems)}\n\n${notChecked}`;
    }

    let $string = `${formatReportHeading(title, countFindings(this.values()), this.size)}\n`;
    const budget = new ReportEntryBudget();
    for (const [notePath, diagnostics] of this) {
      if (budget.isExhausted) {
        budget.omit(diagnostics.length);
        continue;
      }

      const note = getFileOrNull({ app, pathOrFile: notePath });
      if (!note) {
        continue;
      }

      const lines: string[] = [];
      for (const diagnostic of diagnostics) {
        if (budget.take()) {
          lines.push(`- ${describeDiagnostic(diagnostic)}`);
        }
      }
      $string += formatReportCallout(generateMarkdownLink({ app, sourcePathOrFile: reportPath, targetPathOrFile: note }), diagnostics.length, lines);
    }

    return `${$string}${budget.describeOmission()}${notChecked}`;
  }
}

/**
 * Asks `Advanced Metadata Cache` for each note's HTML diagnostics.
 */
export class HtmlProblemHandler {
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: HtmlProblemHandlerConstructorParams) {
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async check(params: HtmlProblemHandlerCheckParams): Promise<void> {
    const { htmlProblems, notePath } = params;
    const { api } = htmlProblems;

    if (!api || this.pluginSettingsComponent.settings.isPathIgnored(notePath)) {
      return;
    }

    const diagnostics = await api.getHtmlDiagnosticsSafe(notePath);

    if (diagnostics === null) {
      htmlProblems.markUnchecked();
      return;
    }

    htmlProblems.add(notePath, diagnostics);
  }

  /**
   * A result for one walk. The provider is looked up once, so a plugin enabled or disabled mid-walk cannot make
   * part of the section answer one way and part the other.
   *
   * @returns The empty result.
   */
  public createResult(): HtmlProblemCheckResult {
    return new HtmlProblemCheckResult(findHtmlApi());
  }
}

function describeDiagnostic(diagnostic: HtmlDiagnostic): string {
  const params = {
    html: diagnostic.range.html.replaceAll('`', '\''),
    line: String(diagnostic.range.position.start.line + 1)
  };

  return diagnostic.kind === 'unknown'
    ? t(($) => $.htmlProblems.report.unknown, params)
    : t(($) => $.htmlProblems.report.sanitized, params);
}

function findHtmlApi(): AdvancedMetadataCacheHtmlApi | null {
  try {
    return findPluginApi<AdvancedMetadataCacheHtmlApi>({
      apiVersionRange: ADVANCED_METADATA_CACHE_HTML_API_VERSION_RANGE,
      pluginId: ADVANCED_METADATA_CACHE_PLUGIN_ID
    });
  } catch {
    // A revoked registry record throws on access: treat it as absent rather than failing the whole report.
    return null;
  }
}
