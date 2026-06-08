import type { App } from 'obsidian';

import { noopAsync } from 'obsidian-dev-utils/function';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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

interface CapturedButton {
  click(): void;
  text: string;
}

interface CapturedToggle {
  change(value: boolean): void;
}

const captured = {
  buttons: [] as CapturedButton[],
  toggles: [] as CapturedToggle[]
};

vi.mock('obsidian-dev-utils/html-element', () => ({
  createElAsync: vi.fn(async (tag: string, _options: unknown, cb?: (el: HTMLElement) => Promise<void>) => {
    const el = activeDocument.createElement(tag);
    if (cb) {
      await cb(el);
    }
    return el;
  }),
  createFragmentAsync: vi.fn(async (cb: (f: DocumentFragment) => Promise<void>) => {
    const fragment = createFragment();
    await cb(fragment);
    return fragment;
  })
}));

vi.mock('obsidian-dev-utils/obsidian/markdown', () => ({
  renderInternalLink: vi.fn((): Promise<HTMLElement> => Promise.resolve(createSpan()))
}));

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();

  function noopClick(): void {
    // Placeholder until a real handler is registered.
  }

  function noopChange(_value: boolean): void {
    // Placeholder until a real handler is registered.
  }

  class MockSetting {
    public addButton(cb: (button: unknown) => void): this {
      let text = '';
      let clickHandler: () => void = noopClick;
      cb({
        onClick: (handler: () => void): void => {
          clickHandler = handler;
        },
        setButtonText: (value: string): void => {
          text = value;
        }
      });
      captured.buttons.push({
        click: () => {
          clickHandler();
        },
        text
      });
      return this;
    }

    public addToggle(cb: (toggle: unknown) => void): this {
      let changeHandler: (value: boolean) => void = noopChange;
      cb({
        onChange: (handler: (value: boolean) => void): void => {
          changeHandler = handler;
        },
        setValue: noopChange
      });
      captured.toggles.push({
        change: (value: boolean) => {
          changeHandler(value);
        }
      });
      return this;
    }

    public setHeading(): this {
      return this;
    }

    public setName(): this {
      return this;
    }
  }

  return {
    ...original,
    Setting: MockSetting
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { selectMode } from './collect-attachment-used-by-multiple-notes-modal.ts';

function createApp(): App {
  return strictProxy<App>({});
}

async function flushOnOpen(): Promise<void> {
  // Let the async onOpenAsync register all buttons/toggles before the auto-close timer fires.
  for (let i = 0; i < 10; i++) {
    await noopAsync();
  }
}

beforeAll(async () => {
  await initI18N(translationsMap);
});

describe('selectMode', () => {
  beforeEach(() => {
    captured.buttons.length = 0;
    captured.toggles.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve with Cancel and false when the modal is closed without a selection', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md', 'b.md']);
    await flushOnOpen();
    await vi.advanceTimersByTimeAsync(0);
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
    expect(result.shouldUseSameActionForOtherProblematicAttachments).toBe(false);
  });

  it('should render Skip, Move, Copy and Cancel buttons in non-cancel mode', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    const buttonTexts = captured.buttons.map((button) => button.text);
    expect(buttonTexts).toStrictEqual(['Skip', 'Move', 'Copy', 'Cancel']);
    await vi.advanceTimersByTimeAsync(0);
    await promise;
  });

  it('should resolve with Skip when the Skip button is clicked', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    captured.buttons[0]?.click();
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Skip);
  });

  it('should resolve with Move when the Move button is clicked', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    captured.buttons[1]?.click();
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Move);
  });

  it('should resolve with Copy when the Copy button is clicked', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    captured.buttons[2]?.click();
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Copy);
  });

  it('should resolve with Cancel when the Cancel button is clicked', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    captured.buttons[3]?.click();
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
  });

  it('should reflect the toggle value in the resolved result', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md']);
    await flushOnOpen();
    captured.toggles[0]?.change(true);
    captured.buttons[0]?.click();
    const result = await promise;
    expect(result.shouldUseSameActionForOtherProblematicAttachments).toBe(true);
  });

  it('should only render the Cancel button in cancel mode', async () => {
    const promise = selectMode(createApp(), 'attachment.png', ['a.md'], true);
    await flushOnOpen();
    expect(captured.buttons.map((button) => button.text)).toStrictEqual(['Cancel']);
    expect(captured.toggles).toHaveLength(0);
    captured.buttons[0]?.click();
    const result = await promise;
    expect(result.mode).toBe(CollectAttachmentUsedByMultipleNotesMode.Cancel);
  });
});
