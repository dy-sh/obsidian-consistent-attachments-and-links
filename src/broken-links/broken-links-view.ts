import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App,
  IconName,
  WorkspaceLeaf
} from 'obsidian';

import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  ButtonComponent,
  ItemView
} from 'obsidian';

import type {
  BrokenLink,
  BrokenLinkFix,
  BrokenLinkFixer
} from './broken-link-fixer.ts';

import { getPathMapping } from './broken-link-candidates.ts';

/**
 * The view type the broken-links view is registered under.
 */
export const BROKEN_LINKS_VIEW_TYPE = 'consistent-attachments-and-links-broken-links';

/**
 * Why the links of a group are broken, which decides what the group offers.
 */
export enum BrokenLinkGroupKind {
  /**
   * The target file exists; the heading or block the link names does not.
   */
  MissingSubpath = 'MissingSubpath',

  /**
   * Nothing is known about where the target went.
   */
  NoCandidate = 'NoCandidate',

  /**
   * Every link of the group has exactly one candidate, and every candidate replaces the same old path prefix by
   * the same new one, so one click can fix them all.
   */
  OneCandidate = 'OneCandidate',

  /**
   * Each link has several candidates. Nothing is picked: the user chooses one per link.
   */
  SeveralCandidates = 'SeveralCandidates'
}

/**
 * Broken links that share a cause, and so share what can be done about them.
 */
export interface BrokenLinkGroup {
  readonly brokenLinks: readonly BrokenLink[];
  readonly kind: BrokenLinkGroupKind;
  readonly title: string;
}

interface BrokenLinkGroupKey {
  readonly key: string;
  readonly kind: BrokenLinkGroupKind;
  readonly title: string;
}

interface BrokenLinksViewConstructorParams {
  readonly brokenLinkFixer: BrokenLinkFixer;
  readonly leaf: WorkspaceLeaf;
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

interface BrokenLinksViewRenderGroupParams {
  readonly containerEl: HTMLElement;
  readonly group: BrokenLinkGroup;
}

interface BrokenLinksViewRenderRowParams {
  readonly brokenLink: BrokenLink;
  readonly containerEl: HTMLElement;
}

interface MutableBrokenLinkGroup extends BrokenLinkGroup {
  readonly brokenLinks: BrokenLink[];
}

const GROUP_KIND_ORDER: readonly BrokenLinkGroupKind[] = [
  BrokenLinkGroupKind.OneCandidate,
  BrokenLinkGroupKind.SeveralCandidates,
  BrokenLinkGroupKind.NoCandidate,
  BrokenLinkGroupKind.MissingSubpath
];

/**
 * The broken links of the vault, grouped by cause, each with what can be done about it: a fix when exactly one
 * file is known to be its target, a choice when several are, and always a way to open the note or hide the row.
 *
 * Nothing is fixed without a click, and a link with several candidates is never fixed by a group action.
 */
export class BrokenLinksView extends ItemView {
  private readonly brokenLinkFixer: BrokenLinkFixer;
  private brokenLinks: BrokenLink[] | null = null;
  private readonly ignoredBrokenLinks = new Set<BrokenLink>();
  private isBusy = false;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  public constructor(params: BrokenLinksViewConstructorParams) {
    super(params.leaf);
    this.brokenLinkFixer = params.brokenLinkFixer;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  public override getDisplayText(): string {
    return 'Broken links';
  }

  public override getIcon(): IconName {
    return 'unlink';
  }

  public override getViewType(): string {
    return BROKEN_LINKS_VIEW_TYPE;
  }

  /**
   * Looks for the vault's broken links again, showing every row hidden by Ignore again too.
   */
  public async recheck(): Promise<void> {
    if (this.isBusy) {
      return;
    }

    this.isBusy = true;
    this.render();
    try {
      this.brokenLinks = await this.brokenLinkFixer.findBrokenLinks();
      this.ignoredBrokenLinks.clear();
    } finally {
      this.isBusy = false;
      this.render();
    }
  }

  protected override async onOpen(): Promise<void> {
    await super.onOpen();
    this.render();
  }

  private async applyFixes(fixes: readonly BrokenLinkFix[]): Promise<void> {
    if (this.isBusy) {
      return;
    }

    this.isBusy = true;
    let appliedFixes: BrokenLinkFix[];
    try {
      appliedFixes = await this.brokenLinkFixer.fix(fixes);
    } finally {
      this.isBusy = false;
    }

    const fixedBrokenLinks = new Set(appliedFixes.map((fix) => fix.brokenLink));
    this.brokenLinks = ensureNonNullable(this.brokenLinks).filter((brokenLink) => !fixedBrokenLinks.has(brokenLink));

    const missedCount = fixes.length - appliedFixes.length;
    if (missedCount > 0) {
      this.pluginNoticeComponent.showNotice(
        `${String(missedCount)} of ${String(fixes.length)} links changed since the check and were left as they are. Re-check to see them as they are now.`
      );
    }

    this.render();
  }

  private ignore(brokenLink: BrokenLink): void {
    this.ignoredBrokenLinks.add(brokenLink);
    this.render();
  }

  private async openSource(brokenLink: BrokenLink): Promise<void> {
    const file = getFileOrNull({ app: this.app, pathOrFile: brokenLink.sourcePath });
    if (!file) {
      return;
    }

    const line = isReferenceCache(brokenLink.reference) ? brokenLink.reference.position.start.line : 0;
    // eslint-disable-next-line unicorn/name-replacements -- Obsidian's OpenViewState names it.
    await this.app.workspace.getLeaf('tab').openFile(file, { eState: { line } });
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('consistent-attachments-and-links-broken-links-view');

    const toolbarEl = contentEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-toolbar' });
    new ButtonComponent(toolbarEl)
      .setButtonText(this.brokenLinks ? 'Re-check' : 'Check')
      .setDisabled(this.isBusy)
      .onClick(() => {
        invokeAsyncSafely(() => this.recheck());
      });

    if (this.isBusy && !this.brokenLinks) {
      contentEl.createDiv({ cls: 'pane-empty', text: 'Looking for broken links...' });
      return;
    }

    if (!this.brokenLinks) {
      contentEl.createDiv({ cls: 'pane-empty', text: 'Check the vault to list its broken links.' });
      return;
    }

    const visibleBrokenLinks = this.brokenLinks.filter((brokenLink) => !this.ignoredBrokenLinks.has(brokenLink));
    if (visibleBrokenLinks.length === 0) {
      contentEl.createDiv({ cls: 'pane-empty', text: 'No broken links found.' });
      return;
    }

    for (const group of groupBrokenLinks(visibleBrokenLinks)) {
      this.renderGroup({ containerEl: contentEl, group });
    }
  }

  private renderGroup(params: BrokenLinksViewRenderGroupParams): void {
    const { containerEl, group } = params;
    const groupEl = containerEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-group' });
    const headerEl = groupEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-group-header' });
    headerEl.createEl('h4', { text: `${group.title} (${String(group.brokenLinks.length)})` });

    // A group of one has its row's own Fix button, so a second one here would only repeat it.
    if (group.kind === BrokenLinkGroupKind.OneCandidate && group.brokenLinks.length > 1) {
      new ButtonComponent(headerEl)
        .setButtonText('Fix all like this')
        .setCta()
        .setDisabled(this.isBusy)
        .onClick(() => {
          invokeAsyncSafely(() => this.applyFixes(group.brokenLinks.map((brokenLink) => getOnlyFix(brokenLink))));
        });
    }

    for (const brokenLink of group.brokenLinks) {
      this.renderRow({ brokenLink, containerEl: groupEl });
    }
  }

  private renderRow(params: BrokenLinksViewRenderRowParams): void {
    const { brokenLink, containerEl } = params;
    const rowEl = containerEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-row' });
    const sourceEl = rowEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-source' });
    sourceEl.createSpan({ text: `${brokenLink.sourcePath} ${getLocation(brokenLink)}: ` });
    appendCodeBlock(sourceEl, brokenLink.reference.original);

    for (const candidate of brokenLink.candidates) {
      const candidateEl = rowEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-candidate' });
      const candidateLineEl = candidateEl.createDiv();
      candidateLineEl.createSpan({ text: '→ ' });
      appendCodeBlock(candidateLineEl, candidate.path);
      if (brokenLink.candidates.length > 1) {
        new ButtonComponent(candidateLineEl)
          .setButtonText('Use this')
          .setDisabled(this.isBusy)
          .onClick(() => {
            invokeAsyncSafely(() => this.applyFixes([{ brokenLink, targetPath: candidate.path }]));
          });
      }
      const evidenceEl = candidateEl.createEl('ul', { cls: 'consistent-attachments-and-links-broken-links-evidence' });
      for (const evidence of candidate.evidence) {
        evidenceEl.createEl('li', { text: evidence.description });
      }
    }

    const actionsEl = rowEl.createDiv({ cls: 'consistent-attachments-and-links-broken-links-actions' });
    if (brokenLink.candidates.length === 1) {
      new ButtonComponent(actionsEl)
        .setButtonText('Fix')
        .setDisabled(this.isBusy)
        .onClick(() => {
          invokeAsyncSafely(() => this.applyFixes([getOnlyFix(brokenLink)]));
        });
    }
    new ButtonComponent(actionsEl)
      .setButtonText('Open source')
      .onClick(() => {
        invokeAsyncSafely(() => this.openSource(brokenLink));
      });
    new ButtonComponent(actionsEl)
      .setButtonText('Ignore')
      .onClick(() => {
        this.ignore(brokenLink);
      });
  }
}

/**
 * Groups broken links by cause: one group per old-to-new path mapping for the links with exactly one candidate,
 * then the links with several candidates, those with none, and those whose target exists.
 *
 * @param brokenLinks - The broken links.
 * @returns The groups, the largest fixable group first.
 */
export function groupBrokenLinks(brokenLinks: readonly BrokenLink[]): BrokenLinkGroup[] {
  const groupsByKey = new Map<string, MutableBrokenLinkGroup>();

  for (const brokenLink of brokenLinks) {
    const { key, kind, title } = getGroupKey(brokenLink);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { brokenLinks: [], kind, title };
      groupsByKey.set(key, group);
    }
    group.brokenLinks.push(brokenLink);
  }

  return [...groupsByKey.values()].sort((group1, group2) =>
    GROUP_KIND_ORDER.indexOf(group1.kind) - GROUP_KIND_ORDER.indexOf(group2.kind)
    || group2.brokenLinks.length - group1.brokenLinks.length
    || group1.title.localeCompare(group2.title)
  );
}

/**
 * Shows the broken-links view in a tab of its own, reusing the open one, and checks the vault again.
 *
 * @param app - The Obsidian app.
 */
export async function openBrokenLinksView(app: App): Promise<void> {
  const leaf = app.workspace.getLeavesOfType(BROKEN_LINKS_VIEW_TYPE)[0] ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ active: true, type: BROKEN_LINKS_VIEW_TYPE });
  await app.workspace.revealLeaf(leaf);
  if (leaf.view instanceof BrokenLinksView) {
    await leaf.view.recheck();
  }
}

function formatPrefix(prefix: string): string {
  return prefix ? `"${prefix}"` : 'the vault root';
}

function getGroupKey(brokenLink: BrokenLink): BrokenLinkGroupKey {
  if (brokenLink.isTargetFound) {
    return { key: BrokenLinkGroupKind.MissingSubpath, kind: BrokenLinkGroupKind.MissingSubpath, title: 'The file exists, but not the heading or block' };
  }

  const [candidate, ...otherCandidates] = brokenLink.candidates;
  if (!candidate) {
    return { key: BrokenLinkGroupKind.NoCandidate, kind: BrokenLinkGroupKind.NoCandidate, title: 'No candidate found' };
  }

  if (otherCandidates.length > 0) {
    return { key: BrokenLinkGroupKind.SeveralCandidates, kind: BrokenLinkGroupKind.SeveralCandidates, title: 'Several candidates: choose one' };
  }

  const { newPrefix, oldPrefix } = getPathMapping(brokenLink.targetPath, candidate.path);
  return {
    key: `${BrokenLinkGroupKind.OneCandidate}\0${oldPrefix}\0${newPrefix}`,
    kind: BrokenLinkGroupKind.OneCandidate,
    title: `${formatPrefix(oldPrefix)} is now ${formatPrefix(newPrefix)}`
  };
}

function getLocation(brokenLink: BrokenLink): string {
  if (isReferenceCache(brokenLink.reference)) {
    return `(line ${String(brokenLink.reference.position.start.line + 1)})`;
  }

  return isFrontmatterLinkCache(brokenLink.reference) ? `(property ${brokenLink.reference.key})` : '';
}

function getOnlyFix(brokenLink: BrokenLink): BrokenLinkFix {
  return { brokenLink, targetPath: ensureNonNullable(brokenLink.candidates[0]).path };
}
