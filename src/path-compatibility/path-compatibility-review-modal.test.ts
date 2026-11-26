// @vitest-environment jsdom

import type { PathCompatibilityViolation } from '@mnaoumov/obsidian-lib/path-compatibility';
import type { App as AppOriginal } from 'obsidian';
import type { MockInstance } from 'vitest';

import { initI18N } from '@mnaoumov/obsidian-lib/i18n/i18n';
import {
  PathCompatibilityPlatform,
  PathCompatibilityViolationType
} from '@mnaoumov/obsidian-lib/path-compatibility';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  ButtonComponent,
  Modal
} from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PathCompatibilityEntry } from './path-compatibility-handler.ts';

import { translationsMap } from '../i18n/locales/translations-map.ts';
import { showPathCompatibilityReviewModal } from './path-compatibility-review-modal.ts';

const RESERVED: PathCompatibilityViolation = { platform: PathCompatibilityPlatform.Windows, type: PathCompatibilityViolationType.ReservedName };

const ENTRIES: PathCompatibilityEntry[] = [
  { newPath: 'CON_.md', path: 'CON.md', violations: [RESERVED] },
  { newPath: 'a-b.md', path: 'a?b.md', violations: [RESERVED] },
  { newPath: null, path: 'unrepairable.md', violations: [RESERVED] }
];

let app: AppOriginal;
let buttons: ButtonComponent[];
let keepPath: ReturnType<typeof vi.fn<(path: string) => Promise<void>>>;
let openSpy: MockInstance<Modal['open']>;

interface ClickableButton {
  readonly simulateClick__: () => void;
}

function click(text: string): void {
  const button = findButton(text);
  expect(button, `button "${text}"`).not.toBeNull();
  castTo<ClickableButton>(button).simulateClick__();
}

function findButton(text: string): ButtonComponent | null {
  return buttons.find((button) => button.buttonEl.textContent === text && getModal().contentEl.contains(button.buttonEl)) ?? null;
}

function findKeepButtons(): ButtonComponent[] {
  return buttons.filter((button) => button.buttonEl.textContent === 'Always keep' && getModal().contentEl.contains(button.buttonEl));
}

async function flush(): Promise<void> {
  for (let index = 0; index < 10; index++) {
    await noopAsync();
  }
}

function getCheckboxes(): HTMLInputElement[] {
  return [...getModal().contentEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
}

function getModal(): Modal {
  return castTo<Modal>(openSpy.mock.contexts.at(-1));
}

function open(): Promise<null | ReadonlySet<string>> {
  return showPathCompatibilityReviewModal({ app, entries: ENTRIES, keepPath });
}

beforeAll(async () => {
  await initI18N(translationsMap);
});

beforeEach(() => {
  app = App.createConfigured__().asOriginalType__();
  buttons = [];
  keepPath = vi.fn<(path: string) => Promise<void>>(() => noopAsync());
  const originalOnClick = ButtonComponent.prototype.onClick;
  vi.spyOn(ButtonComponent.prototype, 'onClick').mockImplementation(function onClickMock(this: ButtonComponent, callback: (mouseEvent: MouseEvent) => unknown): ButtonComponent {
    buttons.push(this);
    return originalOnClick.call(this, callback);
  });
  openSpy = vi.spyOn(Modal.prototype, 'open');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('showPathCompatibilityReviewModal', () => {
  it('should list every item with its new path and violations, ticking every repairable one', async () => {
    const promise = open();
    await flush();

    const text = getModal().contentEl.textContent;
    expect(text).toContain('3 item(s) would be renamed');
    expect(text).toContain('CON.md → CON_.md');
    expect(text).toContain('a?b.md → a-b.md');
    expect(text).toContain('Name is reserved on Windows.');
    expect(text).toContain('Cannot be repaired automatically');
    // The unrepairable item has no checkbox: there is nothing to rename it to.
    expect(getCheckboxes().map((checkbox) => checkbox.checked)).toStrictEqual([true, true]);
    expect(getModal().containerEl.classList.contains('consistent-attachments-and-links-path-compatibility-review')).toBe(true);

    click('Rename 2 ticked');
    expect(await promise).toStrictEqual(new Set(['a?b.md', 'CON.md']));
  });

  it('should answer only the ticked items', async () => {
    const promise = open();
    await flush();

    const [first] = getCheckboxes();
    if (first) {
      first.checked = false;
      first.dispatchEvent(new Event('change'));
    }

    click('Rename 1 ticked');
    expect(await promise).toStrictEqual(new Set(['a?b.md']));
  });

  it('should untick and tick everything, and disable renaming with nothing ticked', async () => {
    const promise = open();
    await flush();

    click('Select none');
    expect(getCheckboxes().every((checkbox) => !checkbox.checked)).toBe(true);
    expect(findButton('Rename 0 ticked')?.buttonEl.disabled).toBe(true);

    click('Select all');
    expect(getCheckboxes().every((checkbox) => checkbox.checked)).toBe(true);
    expect(findButton('Rename 2 ticked')?.buttonEl.disabled).toBe(false);

    getModal().close();
    expect(await promise).toBeNull();
  });

  it('should answer null when cancelled', async () => {
    const promise = open();
    await flush();

    click('Cancel');
    expect(await promise).toBeNull();
  });

  it('should keep an item for good and drop it from the ticked set', async () => {
    const promise = open();
    await flush();

    const keepButtons = findKeepButtons();
    expect(keepButtons).toHaveLength(3);
    castTo<ClickableButton>(keepButtons[0]).simulateClick__();
    await flush();

    expect(keepPath).toHaveBeenCalledWith('CON.md');
    expect(getModal().contentEl.textContent).toContain('Kept as it is.');
    expect(getCheckboxes()).toHaveLength(1);
    expect(findKeepButtons()).toHaveLength(2);

    click('Rename 1 ticked');
    expect(await promise).toStrictEqual(new Set(['a?b.md']));
  });

  it('should keep an unrepairable item too', async () => {
    const promise = open();
    await flush();

    castTo<ClickableButton>(findKeepButtons()[2]).simulateClick__();
    await flush();

    expect(keepPath).toHaveBeenCalledWith('unrepairable.md');
    expect(getCheckboxes()).toHaveLength(2);

    getModal().close();
    expect(await promise).toBeNull();
  });
});
