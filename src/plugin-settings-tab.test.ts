import type {
  SettingGroup,
  ToggleComponent
} from 'obsidian';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventMap } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { AsyncEvents } from 'obsidian-dev-utils/async-events';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
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

// What the stubbed suggestion component reports, so a test can put the tab in either state.
let suggestedPluginState: SuggestedPluginState = SuggestedPluginState.NotInstalled;
const renderBanner = vi.fn();

async function createTab(): Promise<CreatedTab> {
  const app = App.createConfigured__();
  const pluginSettingsComponent = new PluginSettingsComponent({
    dataHandler: new MockDataHandler(),
    pluginEventSource: new AsyncEvents<PluginEventMap>()
  });
  // The component must be loaded before its settings can be edited; obsidian-dev-utils 70.0.0
  // makes setProperty/editAndSave throw when the component is not loaded.
  await pluginSettingsComponent.loadWithPromises();
  const plugin = strictProxy<Plugin>({ app: app.asOriginalType__() });
  const toggles: ToggleComponent[] = [];
  const addToggleSpy = vi.spyOn(SettingEx.prototype, 'addToggle');
  addToggleSpy.mockImplementation(function capturingAddToggle(this: SettingEx, callback: (toggle: ToggleComponent) => unknown): SettingEx {
    return originalAddToggle.call(this, (toggle: ToggleComponent) => {
      toggles.push(toggle);
      callback(toggle);
    });
  });
  // The banner row asks the suggestion component whether to render, then hands it an element. A stub keeps
  // both out of the community-plugin registry, which the real component reads.
  const tab = new PluginSettingsTab({
    plugin,
    pluginSettingsComponent,
    pluginSuggestionComponent: strictProxy<PluginSuggestionComponent>({
      getSuggestedPluginState: () => suggestedPluginState,
      renderBanner
    })
  });

  renderRows(tab);
  addToggleSpy.mockRestore();
  return { pluginSettingsComponent, tab, toggles };
}

function getSettingNames(tab: PluginSettingsTab): string[] {
  return tab.getSettingDefinitions().map((definition) => 'name' in definition ? definition.name : '');
}

function isBannerVisible(tab: PluginSettingsTab): boolean {
  const [firstDefinition] = tab.getSettingDefinitions();
  if (!firstDefinition || !('visible' in firstDefinition) || typeof firstDefinition.visible !== 'function') {
    throw new TypeError('The first row is not the suggestion banner.');
  }
  return firstDefinition.visible();
}

/**
 * Invokes every declared row's `render` callback the way Obsidian does when the tab is opened, so the
 * bindings are still exercised now that the rows are declarative.
 *
 * @param tab - The settings tab.
 */
function renderRows(tab: PluginSettingsTab): void {
  for (const definition of tab.getSettingDefinitions()) {
    if ('render' in definition) {
      definition.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
    }
  }
}

beforeAll(async () => {
  await initI18N(translationsMap);
  // Obsidian-dev-utils' bind() probes setPlaceholderValue to detect text-based components.
  for (const prototype of [ToggleComponentClass.prototype, DropdownComponentClass.prototype, TextComponentClass.prototype]) {
    if (!('setPlaceholderValue' in prototype)) {
      Object.defineProperty(prototype, 'setPlaceholderValue', { value: undefined });
    }
  }
});

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suggestedPluginState = SuggestedPluginState.NotInstalled;
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
    expect(names).toContain('Consistency report filename');
    expect(names).toContain('Include paths');
    expect(names).toContain('Exclude paths');
    expect(names).toContain('Treat as attachment extensions');
  });

  // Advanced Rename and Delete Handler owns these since 4.0.0, so offering them here would be offering to
  // configure a handler this plugin no longer runs.
  it('should not render the rename and delete settings it no longer owns', async () => {
    const { tab } = await createTab();
    const names = getSettingNames(tab);
    expect(names).not.toContain('Move Attachments with Note');
    expect(names).not.toContain('Delete Unused Attachments with Note');
    expect(names).not.toContain('Update links');
    expect(names).not.toContain('Empty folder behavior');
    expect(names).not.toContain('Delete Duplicate Attachments on Note Move');
    expect(names).not.toContain('Update backlink text on note rename');
  });

  // Custom Attachment Location owns these since 5.0.0.
  it('should not render the collect settings it no longer owns', async () => {
    const { tab } = await createTab();
    const names = getSettingNames(tab);
    expect(names).not.toContain('Add commands to file menu');
    expect(names).not.toContain('Auto Collect Attachments');
    expect(names).not.toContain('Exclude paths from attachment collecting');
    expect(names).not.toContain('Attachment unit folders');
    expect(names).not.toContain('Collect attachment used by multiple notes mode');
    expect(names).not.toContain('Move attachment to proper folder used by multiple notes mode');
  });

  // The banner has to be a row: Obsidian never calls `display()` once the declarative definitions are
  // non-empty, so a row is the only place it can go.
  it('should carry the Custom Attachment Location suggestion banner as its first row', async () => {
    const { tab } = await createTab();
    expect(getSettingNames(tab)[0]).toBe('');
    expect(renderBanner).toHaveBeenCalledOnce();
  });

  it('should show the suggestion banner while the suggested plugin is not enabled', async () => {
    const { tab } = await createTab();
    expect(isBannerVisible(tab)).toBe(true);
  });

  // Nothing to suggest once it is installed and running, so the row takes no space.
  it('should hide the suggestion banner once the suggested plugin is enabled', async () => {
    suggestedPluginState = SuggestedPluginState.Enabled;
    const { tab } = await createTab();
    expect(isBannerVisible(tab)).toBe(false);
  });

  it('should bind its toggles', async () => {
    const { toggles } = await createTab();
    expect(toggles.length).toBeGreaterThan(0);
  });
});
