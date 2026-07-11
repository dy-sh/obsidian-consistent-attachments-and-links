import type {
  App,
  ButtonComponent,
  ToggleComponent
} from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  ButtonComponent as ButtonComponentClass,
  Setting as SettingClass
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { translationsMap } from '../i18n/locales/translations-map.ts';
import { CollectAttachmentUsedByMultipleNotesMode } from '../plugin-settings.ts';
import { selectMode } from './collect-attachment-used-by-multiple-notes-modal.ts';

vi.mock('obsidian-dev-utils/obsidian/markdown', () => ({
  renderInternalLink: vi.fn((): Promise<HTMLElement> => Promise.resolve(createSpan()))
}));

const captured = {
  buttons: [] as ButtonComponent[],
  toggles: [] as ToggleComponent[]
};

const originalAddButton = SettingClass.prototype.addButton;
const originalAddToggle = SettingClass.prototype.addToggle;

function clickButton(button: ButtonComponent | undefined): void {
  if (button) {
    ButtonComponentClass.fromOriginalType2__(button).simulateClick__();
  }
}

function createApp(): App {
  return strictProxy<App>({});
}

async function flushOnOpen(): Promise<void> {
  // Let the async onOpenAsync register all buttons/toggles before the auto-close timer fires.
  for (let i = 0; i < 10; i++) {
    await noopAsync();
  }
}

function getButtonText(button: ButtonComponent): string {
  return ButtonComponentClass.fromOriginalType2__(button).buttonEl.textContent;
}

beforeAll(async () => {
  await initI18N(translationsMap);
});

describe('selectMode', () => {
  beforeEach(() => {
    captured.buttons.length = 0;
    captured.toggles.length = 0;

    // Capture the REAL test-mocks ButtonComponent/ToggleComponent instances created by the
    // REAL Setting so interactions can be driven through their real DOM/handlers.
    vi.spyOn(SettingClass.prototype, 'addButton').mockImplementation(function capturingAddButton(
      this: SettingClass,
      cb: (button: ButtonComponent) => unknown
    ): SettingClass {
      return originalAddButton.call(this, (button: ButtonComponent) => {
        captured.buttons.push(button);
        cb(button);
      });
    });
    vi.spyOn(SettingClass.prototype, 'addToggle').mockImplementation(function capturingAddToggle(
      this: SettingClass,
      cb: (toggle: ToggleComponent) => unknown
    ): SettingClass {
      return originalAddToggle.call(this, (toggle: ToggleComponent) => {
        captured.toggles.push(toggle);
        cb(toggle);
      });
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should resolve with Cancel and false when the modal is closed without a selection', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md', 'b.md'] });
    await flushOnOpen();
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
    expect(result.shouldUseSameActionForOtherProblematicAttachments).toBe(false);
  });

  it('should render Skip, Move, Copy and Cancel buttons in non-cancel mode', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    const buttonTexts = captured.buttons.map(getButtonText);
    expect(buttonTexts).toStrictEqual(['Skip', 'Move', 'Copy', 'Cancel']);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });

  it('should resolve with Skip when the Skip button is clicked', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    clickButton(captured.buttons[0]);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Skip);
  });

  it('should resolve with Move when the Move button is clicked', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    clickButton(captured.buttons[1]);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Move);
  });

  it('should resolve with Copy when the Copy button is clicked', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    clickButton(captured.buttons[2]);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Copy);
  });

  it('should resolve with Cancel when the Cancel button is clicked', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    clickButton(captured.buttons[3]);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
  });

  it('should reflect the toggle value in the resolved result', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'] });
    await flushOnOpen();
    captured.toggles[0]?.setValue(true);
    clickButton(captured.buttons[0]);
    const result = await promise;
    expect(result.shouldUseSameActionForOtherProblematicAttachments).toBe(true);
  });

  it('should only render the Cancel button in cancel mode', async () => {
    const promise = selectMode({ app: createApp(), attachmentPath: 'attachment.png', backlinks: ['a.md'], isCancelMode: true });
    await flushOnOpen();
    expect(captured.buttons.map(getButtonText)).toStrictEqual(['Cancel']);
    expect(captured.toggles).toHaveLength(0);
    clickButton(captured.buttons[0]);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
  });
});
