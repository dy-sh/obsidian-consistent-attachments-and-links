/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors and constructor-only classes. */
import type {
  App as AppOriginal,
  Command,
  PluginManifest
} from 'obsidian';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { Component } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getObsidianDevUtilsState } from 'obsidian-dev-utils/obsidian-dev-utils-state';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface AppGlobal {
  app: AppOriginal;
}

interface CommandsHolder {
  commands__: Map<string, Command>;
}

interface EventRef {
  id: string;
}

interface PluginPrivate {
  createTranslationsMap(): TranslationsMap;
}

interface PluginSuggestionComponentParams {
  isSuggestionDeclined(this: void): boolean;
  setSuggestionDeclined(this: void, isDeclined: boolean): Promise<void>;
  readonly suggestedPluginId: string;
}

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  mockSettings: {
    isAdvancedRenameAndDeleteHandlerSuggestionDeclined: false,
    isPathIgnored: vi.fn((): boolean => false),
    proposedRenameDeleteSettings: null
  }
}));

// --- Mocks for the plugin's OWN sibling modules (allowed: not obsidian-dev-utils / obsidian-test-mocks) ---

vi.mock('./links-handler.ts', () => ({
  LinksHandler: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('./files-handler.ts', () => ({
  FilesHandler: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('./attachment-collector.ts', () => ({
  AttachmentCollector: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('./consistent-attachments-and-links-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  ConsistentAttachmentsAndLinksComponent: class extends Component {
    public constructor(_params: unknown) {
      super();
    }
  }
}));

vi.mock('./plugin-settings-component.ts', () => ({
  // Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it.
  PluginSettingsComponent: class extends Component {
    public editAndSave = vi.fn(async (settingsEditor: (settings: unknown) => void): Promise<void> => {
      settingsEditor(hoisted.mockSettings);
      await noopAsync();
    });

    public on = vi.fn((event: string): EventRef => ({ id: `${event}-ref` }));

    public settings = hoisted.mockSettings;

    public constructor(_params: unknown) {
      super();
    }
  }
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

// Extends the real obsidian-test-mocks Component so the real addChild lifecycle can load it without the
// Migration reaching for another plugin's API.
vi.mock('./rename-delete-handler-migration-component.ts', () => ({
  RenameDeleteHandlerMigrationComponent: class extends Component {
    public constructor(_params: unknown) {
      super();
    }
  }
}));

// Capture the `PluginSuggestionComponent` constructor argument so the closures the plugin hands it — the
// Declined-flag getter and setter — can be invoked directly. The stub returns a fresh real Component so the
// Real PluginBase lifecycle can load it as a child without reaching the community-plugin registry.
const { pluginSuggestionStub } = vi.hoisted(() => ({
  pluginSuggestionStub: vi.fn<(params: PluginSuggestionComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-suggestion-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/plugin-suggestion-component')>();
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  pluginSuggestionStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    PluginSuggestionComponent: pluginSuggestionStub
  };
});

// --- Command handler mocks (the plugin's own modules) ---

let nextCommandHandlerIndex = 0;

const { CommandHandlerMock } = vi.hoisted(() => ({
  CommandHandlerMock: class {
    public constructor(_params: unknown) {
      // No-op command handler mock.
    }

    public buildCommand(): Command {
      nextCommandHandlerIndex++;
      return {
        id: `command-${String(nextCommandHandlerIndex)}`,
        name: `Command ${String(nextCommandHandlerIndex)}`
      };
    }

    public onRegistered(): Promise<void> {
      return noopAsync();
    }
  }
}));

vi.mock('./command-handlers/check-consistency-command-handler.ts', () => ({ CheckConsistencyCommandHandler: CommandHandlerMock }));
vi.mock('./command-handlers/collect-attachments-entire-vault-command-handler.ts', () => ({ CollectAttachmentsEntireVaultCommandHandler: CommandHandlerMock }));
vi.mock(
  './command-handlers/collect-attachments-in-current-folder-command-handler.ts',
  () => ({ CollectAttachmentsInCurrentFolderCommandHandler: CommandHandlerMock })
);
vi.mock('./command-handlers/collect-attachments-in-file-command-handler.ts', () => ({ CollectAttachmentsInFileCommandHandler: CommandHandlerMock }));
vi.mock(
  './command-handlers/convert-all-embeds-paths-to-relative-command-handler.ts',
  () => ({ ConvertAllEmbedsPathsToRelativeCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/convert-all-embeds-paths-to-relative-current-note-command-handler.ts',
  () => ({ ConvertAllEmbedsPathsToRelativeCurrentNoteCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/convert-all-link-paths-to-relative-command-handler.ts',
  () => ({ ConvertAllLinkPathsToRelativeCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/convert-all-link-paths-to-relative-current-note-command-handler.ts',
  () => ({ ConvertAllLinkPathsToRelativeCurrentNoteCommandHandler: CommandHandlerMock })
);
vi.mock('./command-handlers/delete-empty-folders-command-handler.ts', () => ({ DeleteEmptyFoldersCommandHandler: CommandHandlerMock }));
vi.mock('./command-handlers/move-attachment-to-proper-folder-command-handler.ts', () => ({ MoveAttachmentToProperFolderCommandHandler: CommandHandlerMock }));
vi.mock('./command-handlers/reorganize-vault-command-handler.ts', () => ({ ReorganizeVaultCommandHandler: CommandHandlerMock }));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { translationsMap } from './i18n/locales/translations-map.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { RenameDeleteHandlerMigrationComponent } from './rename-delete-handler-migration-component.ts';

const PLUGIN_ID = 'consistent-attachments-and-links';
const PLUGIN_NAME = 'Consistent Attachments and Links';

const manifest = castTo<PluginManifest>({
  author: 'test',
  description: 'test',
  id: PLUGIN_ID,
  minAppVersion: '1.0.0',
  name: PLUGIN_NAME,
  version: '1.0.0'
});

let app: AppOriginal;

function asPrivate(plugin: Plugin): PluginPrivate {
  return castTo<PluginPrivate>(plugin);
}

async function createLoadedPlugin(): Promise<Plugin> {
  const plugin = new Plugin(app, manifest);
  // PluginBase.onload is async, and the synchronous mock Component.load() would not await it, so the real async load path is driven directly (as the obsidian-dev-utils reference test does).
  await plugin.onload();
  return plugin;
}

function hasRegisteredRenameDeleteHandler(): boolean {
  return getObsidianDevUtilsState('renameDeleteHandlersMap', new Map<string>()).value.has(PLUGIN_ID);
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const proxyWithTarget = castTo<Partial<Record<symbol, object>>>(strictProxiedObject);
  const rawTarget = proxyWithTarget[STRICT_PROXY_TARGET_SYMBOL] ?? strictProxiedObject;
  castTo<Record<string, unknown>>(rawTarget)[key] = value;
}

function suggestionParams(): PluginSuggestionComponentParams {
  const call = pluginSuggestionStub.mock.calls[0];
  if (!call) {
    throw new Error('PluginSuggestionComponent was not constructed.');
  }
  return call[0];
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The settings object is shared across tests, and `editAndSave` really writes to it, so the decline flag
    // Has to be put back or a later test inherits an earlier one's answer.
    hoisted.mockSettings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined = false;
    hoisted.mockSettings.proposedRenameDeleteSettings = null;
    hoisted.mockSettings.isPathIgnored.mockReturnValue(false);
    nextCommandHandlerIndex = 0;

    const appMock = App.createConfigured__();
    appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
      callback();
    });
    app = appMock.asOriginalType__();

    // Seed the obsidianDevUtilsState holder on the raw target behind the strict-proxy App so the real getObsidianDevUtilsState can read/write it (the proxy throws on first access to an unassigned property, and the default proxy set-trap would not land the value on the target).
    seedOnRawTarget(app, 'obsidianDevUtilsState', {});

    // Since obsidian-dev-utils 89.0.0 the base bridges its command handlers into Notebook Navigator's
    // Menus, which looks the plugin up on layout-ready -- so `plugins` has to answer on the strict mock.
    seedOnRawTarget(app, 'plugins', { getPlugin: vi.fn().mockReturnValue(null) });

    // Expose the app as the global instance so dev-utils helpers that resolve shared state without an explicit app argument (debug controller, permanent notices) read/write the same seeded holder.
    castTo<AppGlobal>(window).app = app;
  });

  describe('createTranslationsMap', () => {
    it('should return the translations map', () => {
      const plugin = new Plugin(app, manifest);
      expect(asPrivate(plugin).createTranslationsMap()).toBe(translationsMap);
    });
  });

  describe('onloadImpl', () => {
    it('should load the plugin without throwing', async () => {
      const plugin = await createLoadedPlugin();
      expect(plugin).toBeInstanceOf(Plugin);
    });

    it('should register all commands with the plugin', async () => {
      const plugin = await createLoadedPlugin();
      // The plugin wires the OpenDemoVault handler plus 12 feature command handlers through the real CommandHandlerComponent, and PluginBase auto-registers UnlockActiveNoteCommandHandler, for 14 total.
      expect(castTo<CommandsHolder>(plugin).commands__.size).toBe(14);
    });

    it('should register the open demo vault command', async () => {
      const plugin = new Plugin(app, manifest);
      const addCommandSpy = vi.spyOn(plugin, 'addCommand');
      await plugin.onload();
      expect(addCommandSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'open-demo-vault' }));
    });

    it('should add the settings tab to the plugin', async () => {
      const plugin = await createLoadedPlugin();
      expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(1);
    });
  });

  describe('rename and delete handling', () => {
    // Advanced Rename and Delete Handler owns rename/delete handling since 4.0.0. Two handlers acting on one
    // Rename corrupts links and moves attachments twice, so this plugin must register none — the inverse of
    // What it used to assert.
    it('should not register a rename/delete handler of its own', async () => {
      await createLoadedPlugin();
      expect(hasRegisteredRenameDeleteHandler()).toBe(false);
    });

    it('should suggest Advanced Rename and Delete Handler instead', async () => {
      await createLoadedPlugin();
      expect(pluginSuggestionStub).toHaveBeenCalled();
      expect(suggestionParams().suggestedPluginId).toBe('advanced-rename-and-delete-handler');
    });

    it('should report the suggestion as not declined until the user says otherwise', async () => {
      await createLoadedPlugin();
      expect(suggestionParams().isSuggestionDeclined()).toBe(false);
    });

    it('should remember a declined suggestion in its own settings', async () => {
      await createLoadedPlugin();
      const params = suggestionParams();
      await params.setSuggestionDeclined(true);
      expect(params.isSuggestionDeclined()).toBe(true);
    });

    it('should offer the legacy rename and delete settings to the new owner', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');
      await plugin.onload();
      const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
      expect(addedChildren.some((child) => child instanceof RenameDeleteHandlerMigrationComponent)).toBe(true);
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
