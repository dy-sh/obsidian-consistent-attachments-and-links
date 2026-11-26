/**
 * @file
 *
 * The review behind `Fix incompatible paths`: every planned rename, before any of them happens.
 *
 * A bulk rename of hundreds of files with no preview was the riskiest command this plugin had. The review lists
 * each item's old path, the path the repair would give it and why, lets the user untick an item for this run or
 * keep it out of the check for good (`Always keep`, which writes `pathCompatibilityExcludePaths`), and renames
 * only what is left ticked. Every repairable item starts ticked, so confirming at once does what the command
 * always did.
 */

import type { PromiseResolve } from '@mnaoumov/typescript-lib/async';

import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { t } from '@mnaoumov/obsidian-lib/i18n/i18n';
import {
  ModalBase,
  showModal
} from '@mnaoumov/obsidian-lib/modals/modal';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { ButtonComponent } from 'obsidian';

import type {
  PathCompatibilityEntry,
  PathCompatibilityReviewParams
} from './path-compatibility-handler.ts';

import { describeViolation } from './path-compatibility-handler.ts';

const CSS_PREFIX = 'consistent-attachments-and-links-path-compatibility-review';

/**
 * Parameters for {@link showPathCompatibilityReviewModal}: what the handler hands any review.
 */
export type ShowPathCompatibilityReviewModalParams = PathCompatibilityReviewParams;

interface PathCompatibilityReviewModalConstructorParams extends ShowPathCompatibilityReviewModalParams {
  readonly promiseResolve: PromiseResolve<null | ReadonlySet<string>>;
}

interface ReviewRow {
  readonly checkboxEl: HTMLInputElement | null;
  readonly entry: PathCompatibilityEntry;
}

class PathCompatibilityReviewModal extends ModalBase<null | ReadonlySet<string>> {
  private readonly entries: readonly PathCompatibilityEntry[];
  private isConfirmed = false;
  private readonly keepPath: (path: string) => Promise<void>;
  private renameButton: ButtonComponent | null = null;
  private readonly rows: ReviewRow[] = [];

  public constructor(params: PathCompatibilityReviewModalConstructorParams) {
    super(params);
    this.entries = params.entries;
    this.keepPath = params.keepPath;
    this.addCssClasses(CSS_PREFIX);
  }

  public override onClose(): void {
    this.promiseResolve(this.isConfirmed ? this.getTickedPaths() : null);
  }

  public override onOpen(): void {
    this.titleEl.setText(t(($) => $.pathCompatibility.review.title));
    this.contentEl.createEl('p', { text: t(($) => $.pathCompatibility.review.summary, { count: this.entries.length }) });

    const toolbarEl = this.contentEl.createDiv(`${CSS_PREFIX}-toolbar`);
    new ButtonComponent(toolbarEl)
      .setButtonText(t(($) => $.pathCompatibility.review.selectAll))
      .onClick(() => {
        this.setAllTicked(true);
      });
    new ButtonComponent(toolbarEl)
      .setButtonText(t(($) => $.pathCompatibility.review.selectNone))
      .onClick(() => {
        this.setAllTicked(false);
      });

    const listEl = this.contentEl.createDiv(`${CSS_PREFIX}-list`);

    for (const entry of this.entries) {
      this.renderRow(listEl, entry);
    }

    const buttonsEl = this.contentEl.createDiv('modal-button-container');
    this.renameButton = new ButtonComponent(buttonsEl)
      .setCta()
      .onClick(() => {
        this.isConfirmed = true;
        this.close();
      });
    new ButtonComponent(buttonsEl)
      .setButtonText(t(($) => $.obsidianLib.buttons.cancel))
      .onClick(() => {
        this.close();
      });

    this.updateRenameButton();
  }

  private getTickedPaths(): ReadonlySet<string> {
    return new Set(this.rows.filter((row) => row.checkboxEl?.checked === true).map((row) => row.entry.path));
  }

  private renderRow(listEl: HTMLElement, entry: PathCompatibilityEntry): void {
    const rowEl = listEl.createDiv(`${CSS_PREFIX}-row`);

    // An item no name survives the repair of cannot be ticked: there is nothing to rename it to.
    const checkboxEl = entry.newPath === null
      ? null
      : rowEl.createEl('input', { attr: { 'aria-label': entry.path }, type: 'checkbox' });

    if (checkboxEl !== null) {
      checkboxEl.checked = true;
      checkboxEl.addEventListener('change', () => {
        this.updateRenameButton();
      });
    }

    const row: ReviewRow = { checkboxEl, entry };
    this.rows.push(row);

    const bodyEl = rowEl.createDiv(`${CSS_PREFIX}-body`);
    const pathsEl = bodyEl.createDiv();
    appendCodeBlock(pathsEl, entry.path);

    if (entry.newPath === null) {
      bodyEl.createDiv({ cls: 'mod-warning', text: t(($) => $.pathCompatibility.review.cannotRepair) });
    } else {
      pathsEl.appendText(' → ');
      appendCodeBlock(pathsEl, entry.newPath);
    }

    const violationsEl = bodyEl.createEl('ul', { cls: `${CSS_PREFIX}-violations` });

    for (const violation of entry.violations) {
      violationsEl.createEl('li', { text: describeViolation(violation) });
    }

    const keepButton = new ButtonComponent(rowEl)
      .setButtonText(t(($) => $.pathCompatibility.review.alwaysKeep))
      .setTooltip(t(($) => $.pathCompatibility.review.alwaysKeepTooltip));
    keepButton.onClick(convertAsyncToSync(async () => {
      keepButton.setDisabled(true);
      await this.keepPath(entry.path);
      checkboxEl?.remove();
      this.rows.splice(this.rows.indexOf(row), 1);
      keepButton.buttonEl.remove();
      bodyEl.createDiv({ cls: 'mod-success', text: t(($) => $.pathCompatibility.review.kept) });
      this.updateRenameButton();
    }));
  }

  private setAllTicked(isTicked: boolean): void {
    for (const row of this.rows) {
      if (row.checkboxEl !== null) {
        row.checkboxEl.checked = isTicked;
      }
    }

    this.updateRenameButton();
  }

  private updateRenameButton(): void {
    const count = this.getTickedPaths().size;
    // Built in `onOpen` before any row can call this.
    ensureNonNullable(this.renameButton).setButtonText(t(($) => $.pathCompatibility.review.rename, { count })).setDisabled(count === 0);
  }
}

/**
 * Shows the planned renames and lets the user choose which to apply.
 *
 * @param params - The entries, the `Always keep` action and the app.
 * @returns The paths of the ticked entries, or `null` when the review was cancelled or closed. Nothing is renamed
 * here; the caller renames what comes back.
 */
export async function showPathCompatibilityReviewModal(params: ShowPathCompatibilityReviewModalParams): Promise<null | ReadonlySet<string>> {
  return await showModal<null | ReadonlySet<string>>((promiseResolve) =>
    new PathCompatibilityReviewModal({
      ...params,
      promiseResolve
    })
  );
}
