import type { ToggleComponent } from 'obsidian';
import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventMap } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { AsyncEvents } from 'obsidian-dev-utils/async-events';
import { noopAsync } from 'obsidian-dev-utils/function';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { alert } from 'obsidian-dev-utils/obsidian/modals/alert';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  App,
  DropdownComponent as DropdownComponentClass,
  TextComponent as TextComponentClass,
  ToggleComponent as ToggleComponentClass
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

import type { Plugin } from './plugin.ts';

import { translationsMap } from './i18n/locales/translations-map.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

vi.mock('obsidian-dev-utils/obsidian/modals/alert', () => ({
  alert: vi.fn((): Promise<void> => noopAsync())
}));

interface CreatedTab {
  pluginSettingsComponent: PluginSettingsComponent;
  tab: PluginSettingsTab;
  toggles: ToggleComponent[];
}

class MockDataHandler implements DataHandler {
  public async loadData(): Promise<unknown> {
    await noopAsync();
    return {};
  }

  public async saveData(): Promise<void> {
    await noopAsync();
  }
}

const originalAddToggle = SettingEx.prototype.addToggle;

async function createTab(): Promise<CreatedTab> {
  const app = App.createConfigured__();
  const pluginSettingsComponent = new PluginSettingsComponent({
    dataHandler: new MockDataHandler(),
    pluginEventSource: new AsyncEvents<PluginEventMap>()
  });
  // The component must be loaded before its settings can be edited; obsidian-dev-utils 70.0.0
  // Makes setProperty/editAndSave throw when the component is not loaded.
  await pluginSettingsComponent.loadWithPromises();
  const plugin = strictProxy<Plugin>({ app: app.asOriginalType__() });
  const toggles: ToggleComponent[] = [];
  const addToggleSpy = vi.spyOn(SettingEx.prototype, 'addToggle');
  addToggleSpy.mockImplementation(function capturingAddToggle(this: SettingEx, cb: (toggle: ToggleComponent) => unknown): SettingEx {
    return originalAddToggle.call(this, (toggle: ToggleComponent) => {
      toggles.push(toggle);
      cb(toggle);
    });
  });
  const tab = new PluginSettingsTab({
    plugin,
    pluginSettingsComponent
  });

  tab.displayLegacy();
  addToggleSpy.mockRestore();
  return { pluginSettingsComponent, tab, toggles };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await noopAsync();
  }
}

function getSettingNames(tab: PluginSettingsTab): string[] {
  const names: string[] = [];
  for (const settingEl of Array.from(tab.containerEl.children)) {
    const infoEl = settingEl.children[1];
    const nameEl = infoEl?.children[0];
    if (nameEl?.textContent) {
      names.push(nameEl.textContent);
    }
  }
  return names;
}

beforeAll(async () => {
  await initI18N(translationsMap);
  // Obsidian-dev-utils' bind() probes setPlaceholderValue to detect text-based components.
  for (const proto of [ToggleComponentClass.prototype, DropdownComponentClass.prototype, TextComponentClass.prototype]) {
    if (!('setPlaceholderValue' in proto)) {
      Object.defineProperty(proto, 'setPlaceholderValue', { value: undefined });
    }
  }
});

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be constructable', async () => {
    const { tab } = await createTab();
    expect(tab).toBeInstanceOf(PluginSettingsTab);
  });

  it('should render all settings', async () => {
    const { tab } = await createTab();
    const names = getSettingNames(tab);
    expect(names).toContain('Move Attachments with Note');
    expect(names).toContain('Update links');
    expect(names).toContain('Empty folder behavior');
    expect(names).toContain('Consistency report filename');
    expect(names).toContain('Include paths');
    expect(names).toContain('Exclude paths');
    expect(names).toContain('Treat as attachment extensions');
  });

  it('should capture toggles for the dangerous settings', async () => {
    const { toggles } = await createTab();
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('should show a warning when a dangerous setting is enabled', async () => {
    const { toggles } = await createTab();
    const moveAttachmentsToggle = toggles[0];
    expect(moveAttachmentsToggle).toBeDefined();
    moveAttachmentsToggle?.setValue(true);
    await flushMicrotasks();
    expect(alert).toHaveBeenCalled();
  });

  it('should run the dangerous-setting check for every dangerous toggle', async () => {
    const { toggles } = await createTab();
    for (const toggle of toggles) {
      toggle.setValue(true);
      await flushMicrotasks();
    }
    // Four dangerous toggles trigger checkDangerousSetting → alert (move, delete-attachments,
    // Delete-existing-on-move, auto-collect). Non-dangerous toggles have no onChanged handler.
    const DANGEROUS_TOGGLE_COUNT = 4;
    expect(alert).toHaveBeenCalledTimes(DANGEROUS_TOGGLE_COUNT);
  });

  it('should not show a warning when a dangerous setting is disabled', async () => {
    const { toggles } = await createTab();
    const moveAttachmentsToggle = toggles[0];
    expect(moveAttachmentsToggle).toBeDefined();
    moveAttachmentsToggle?.setValue(false);
    await flushMicrotasks();
    expect(alert).not.toHaveBeenCalled();
  });
});
