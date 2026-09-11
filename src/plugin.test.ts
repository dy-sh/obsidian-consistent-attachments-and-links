/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors and constructor-only classes. */
/* eslint-disable perfectionist/sort-named-imports -- dprint orders these members by their ORIGINAL name (`Plugin` before `PluginManifest`) while perfectionist orders them by the LOCAL alias (`PluginManifest` before `PluginOriginal`). For an aliased import the two orders conflict, and satisfying one re-breaks the other. */
import type {
  App as AppOriginal,
  Command,
  Plugin as PluginOriginal,
  PluginManifest
} from 'obsidian';
/* eslint-enable perfectionist/sort-named-imports -- Only the aliased import above is exempt. */
import type { PluginDependency } from 'obsidian-dev-utils/obsidian/components/plugin-gate-component';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { Component } from 'obsidian';
import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getObsidianDevUtilsState } from 'obsidian-dev-utils/obsidian-dev-utils-state';
import { publishPluginApi } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

interface AppGlobal {
  app: AppOriginal;
}

interface CommandsHolder {
  commands__: Map<string, Command>;
}

interface EventRef {
  id: string;
}

// `getPluginDependencies` is protected on the base, so a test reads it through a probe.
interface PluginDependenciesProbe {
  getPluginDependencies(): PluginDependency[];
}

interface PluginPrivate {
  createTranslationsMap(): TranslationsMap;
}

interface SettingsMigrationComponentParams {
  readonly apiVersionRange: string;
  getProposedSettings(this: void): MigratableSettings | null;
  readonly providerPluginId: string;
  retireProposedSettings(this: void): Promise<void>;
  readonly sourcePluginId: string;
}

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => {
  const mockSettings = {
    isPathIgnored: vi.fn((): boolean => false),
    proposedRenameDeleteSettings: null as MigratableSettings | null
  };
  return {
    // Shared rather than a per-instance class field, so a test can assert that a write went through
    // `editAndSave` without having to reach the component instance the plugin built.
    editAndSave: vi.fn(async (settingsEditor: (settings: unknown) => void): Promise<void> => {
      settingsEditor(mockSettings);
      // eslint-disable-next-line obsidian-dev-utils/prefer-noop-async -- a hoisted factory cannot reach a top-level import.
      await Promise.resolve();
    }),
    mockSettings
  };
});

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
    public editAndSave = hoisted.editAndSave;

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

// The same treatment for the dev-utils settings-migration component. What is this plugin's own is the pair
// Of closures it hands over — which pending values are offered, and how the retirement is persisted — so
// They are captured and invoked directly. The offer-and-retire dance around them belongs to dev-utils and is
// Tested there.
const { settingsMigrationStub } = vi.hoisted(() => ({
  settingsMigrationStub: vi.fn<(params: SettingsMigrationComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/settings-migration-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/settings-migration-component')>();
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  settingsMigrationStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    SettingsMigrationComponent: settingsMigrationStub
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
vi.mock('./command-handlers/delete-empty-folders-command-handler.ts', () => ({ DeleteEmptyFoldersCommandHandler: CommandHandlerMock }));
vi.mock('./command-handlers/move-attachment-to-proper-folder-command-handler.ts', () => ({ MoveAttachmentToProperFolderCommandHandler: CommandHandlerMock }));
vi.mock('./command-handlers/reorganize-vault-command-handler.ts', () => ({ ReorganizeVaultCommandHandler: CommandHandlerMock }));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { translationsMap } from './i18n/locales/translations-map.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

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

// The contract the stand-in provider publishes.
const PROVIDER_API_VERSION = '1.0.0';

let app: AppOriginal;
let providerComponent: Component;

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

function migrationParams(): SettingsMigrationComponentParams {
  const call = settingsMigrationStub.mock.calls[0];
  if (!call) {
    throw new Error('SettingsMigrationComponent was not constructed.');
  }
  return call[0];
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const proxyWithTarget = castTo<Partial<Record<symbol, object>>>(strictProxiedObject);
  const rawTarget = proxyWithTarget[STRICT_PROXY_TARGET_SYMBOL] ?? strictProxiedObject;
  castTo<Record<string, unknown>>(rawTarget)[key] = value;
}

/**
 * Withdraws the stand-in provider's API, as Advanced Rename and Delete Handler being disabled would.
 */
function unpublishProviderApi(): void {
  providerComponent.unload();
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The settings object is shared across tests, and `editAndSave` really writes to it, so the pending value
    // Has to be put back or a later test inherits an earlier one's.
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

    // Expose the app as the global instance so dev-utils helpers that resolve shared state without an explicit app argument (debug controller, permanent notices) read/write the same seeded holder.
    castTo<AppGlobal>(window).app = app;

    // What the dependency gate reaches when the dependency is missing: it registers a settings tab explaining
    // What to install. `obsidian-test-mocks` does not model `app.setting`.
    seedOnRawTarget(app, 'setting', {
      addSettingTab: vi.fn(),
      removeSettingTab: vi.fn()
    });

    // Advanced Rename and Delete Handler is a declared dependency, so everything past the base loads only once
    // Its API is published. An empty API is enough: the gate checks only that one is there, at a matching
    // Version. Each test gets a fresh app, and with it a fresh registry.
    providerComponent = new Component();
    providerComponent.load();
    publishPluginApi({
      api: {},
      apiVersion: PROVIDER_API_VERSION,
      component: providerComponent,
      plugin: castTo<PluginOriginal>({ manifest: { id: 'advanced-rename-and-delete-handler' } })
    });
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
      // The plugin wires the OpenDemoVault handler plus 8 feature command handlers through the real CommandHandlerComponent, and PluginBase auto-registers UnlockActiveNoteCommandHandler, for 10 total.
      expect(castTo<CommandsHolder>(plugin).commands__.size).toBe(10);
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

    it('should declare Advanced Rename and Delete Handler as a dependency it cannot run without', () => {
      const plugin = new Plugin(app, manifest);

      const [dependency, ...rest] = castTo<PluginDependenciesProbe>(plugin).getPluginDependencies();

      expect(rest).toEqual([]);
      expect(dependency?.pluginId).toBe('advanced-rename-and-delete-handler');
      expect(dependency?.pluginName).toBe('Advanced Rename and Delete Handler');
      // This plugin only ever migrates, which every `1.x` contract supports.
      expect(dependency?.apiVersionRange).toBe('^1');
      expect(dependency?.reason).toContain('Advanced Rename and Delete Handler');
    });

    it('should load nothing of its own while the dependency is missing', async () => {
      unpublishProviderApi();
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(settingsMigrationStub).not.toHaveBeenCalled();
      expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(0);
      plugin.unload();
    });

    // The commands are registered through the base's universal command component, which outlives the
    // Feature surface; left alone they would stay in the palette, calling into torn-down components.
    it('should withdraw its own commands once the dependency goes away', async () => {
      const plugin = await createLoadedPlugin();
      const commands = castTo<CommandsHolder>(plugin).commands__;
      expect(commands.size).toBe(10);

      unpublishProviderApi();
      await waitForAllAsyncOperations();

      // Only the base's own Unlock active note command is left, which belongs to no surface.
      expect(commands.size).toBe(1);
      plugin.unload();
    });

    it('should offer the legacy rename and delete settings to the new owner', async () => {
      await createLoadedPlugin();
      expect(settingsMigrationStub).toHaveBeenCalledOnce();
      expect(migrationParams().providerPluginId).toBe('advanced-rename-and-delete-handler');
      expect(migrationParams().sourcePluginId).toBe(PLUGIN_ID);
      expect(migrationParams().apiVersionRange).toBe('^1');
    });

    it('should offer nothing while no legacy values are pending', async () => {
      await createLoadedPlugin();
      expect(migrationParams().getProposedSettings()).toBeNull();
    });

    it('should offer the pending values once the settings carry them', async () => {
      await createLoadedPlugin();
      const proposal = { shouldHandleDeletions: true, shouldHandleRenames: true };
      hoisted.mockSettings.proposedRenameDeleteSettings = proposal;

      expect(migrationParams().getProposedSettings()).toBe(proposal);
    });

    // Retiring through `editAndSave` rather than `setProperty` is what makes the retirement outlive a
    // Reload; the in-memory-only variant would offer the migration again forever.
    it('should retire the pending values to disk once the migration is applied', async () => {
      await createLoadedPlugin();
      hoisted.mockSettings.proposedRenameDeleteSettings = { shouldHandleRenames: true };
      hoisted.editAndSave.mockClear();

      await migrationParams().retireProposedSettings();

      expect(hoisted.editAndSave).toHaveBeenCalledOnce();
      expect(migrationParams().getProposedSettings()).toBeNull();
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
