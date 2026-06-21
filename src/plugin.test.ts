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
  commands: Map<string, Command>;
}

interface EventRef {
  id: string;
}

interface PluginPrivate {
  createTranslationsMap(): TranslationsMap;
}

interface RenameDeleteSettingsProbe {
  emptyFolderBehavior: string;
  isNote(path: string): boolean;
  isPathIgnored(path: string): boolean;
  shouldDeleteConflictingAttachments: boolean;
  shouldHandleDeletions: boolean;
  shouldHandleRenames: boolean;
  shouldRenameAttachmentFolder: boolean;
  shouldUpdateFileNameAliases: boolean;
}

type SettingsBuilder = () => RenameDeleteSettingsProbe;

interface SettingTabsHolder {
  settingTabs__: unknown[];
}

const STRICT_PROXY_TARGET_SYMBOL = Symbol.for('strictProxyTarget');

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  capturedLoadSettingsHandlers: [] as ((state: unknown, isInitialLoad: boolean) => void)[],
  capturedSaveSettingsHandlers: [] as (() => void)[],
  mockFilesHandlerInstance: {
    isNoteEx: vi.fn((): boolean => true)
  },
  mockSettings: {
    emptyFolderBehavior: 'DeleteWithEmptyParents',
    isPathIgnored: vi.fn((): boolean => false),
    shouldChangeNoteBacklinksDisplayText: true,
    shouldDeleteAttachmentsWithNote: false,
    shouldDeleteExistingFilesWhenMovingNote: false,
    shouldMoveAttachmentsWithNote: false,
    shouldUpdateLinks: true
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
    public isNoteEx = hoisted.mockFilesHandlerInstance.isNoteEx;

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
    public on = vi.fn((event: string, handler: (...args: unknown[]) => void): EventRef => {
      if (event === 'loadSettings') {
        hoisted.capturedLoadSettingsHandlers.push(handler);
      } else {
        hoisted.capturedSaveSettingsHandlers.push(handler);
      }
      return { id: `${event}-ref` };
    });

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
vi.mock(
  './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-command-handler.ts',
  () => ({ ReplaceAllWikiEmbedsWithMarkdownEmbedsCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/replace-all-wiki-embeds-with-markdown-embeds-current-note-command-handler.ts',
  () => ({ ReplaceAllWikiEmbedsWithMarkdownEmbedsCurrentNoteCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/replace-all-wikilinks-with-markdown-links-command-handler.ts',
  () => ({ ReplaceAllWikilinksWithMarkdownLinksCommandHandler: CommandHandlerMock })
);
vi.mock(
  './command-handlers/replace-all-wikilinks-with-markdown-links-current-note-command-handler.ts',
  () => ({ ReplaceAllWikilinksWithMarkdownLinksCurrentNoteCommandHandler: CommandHandlerMock })
);

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

function getRegisteredSettingsBuilder(): SettingsBuilder {
  const renameDeleteHandlersMap = getObsidianDevUtilsState('renameDeleteHandlersMap', new Map<string, SettingsBuilder>()).value;
  const builder = renameDeleteHandlersMap.get(PLUGIN_ID);
  if (!builder) {
    throw new Error('Rename/delete settings builder was not registered.');
  }
  return builder;
}

function seedOnRawTarget(strictProxiedObject: object, key: string, value: unknown): void {
  const proxyWithTarget = castTo<Partial<Record<symbol, object>>>(strictProxiedObject);
  const rawTarget = proxyWithTarget[STRICT_PROXY_TARGET_SYMBOL] ?? strictProxiedObject;
  castTo<Record<string, unknown>>(rawTarget)[key] = value;
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.capturedLoadSettingsHandlers.length = 0;
    hoisted.capturedSaveSettingsHandlers.length = 0;
    hoisted.mockSettings.isPathIgnored.mockReturnValue(false);
    hoisted.mockFilesHandlerInstance.isNoteEx.mockReturnValue(true);
    nextCommandHandlerIndex = 0;

    const appMock = App.createConfigured__();
    appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
      cb();
    });
    app = appMock.asOriginalType__();

    // Seed the obsidianDevUtilsState holder on the raw target behind the strict-proxy App so the real getObsidianDevUtilsState can read/write it (the proxy throws on first access to an unassigned property, and the default proxy set-trap would not land the value on the target).
    seedOnRawTarget(app, 'obsidianDevUtilsState', {});

    // The real RenameDeleteHandlerComponent monkey-patches FileManager.runAsyncLinkUpdate during its onload, so it is provided on the mock FileManager for the real patch to wrap the original.
    seedOnRawTarget(app.fileManager, 'runAsyncLinkUpdate', vi.fn((handler: (updates: unknown[]) => Promise<void>) => handler([])));

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
      // The plugin wires 15 command handlers through the real CommandHandlerComponent.
      expect(castTo<CommandsHolder>(plugin).commands.size).toBe(15);
    });

    it('should add the settings tab to the plugin', async () => {
      const plugin = await createLoadedPlugin();
      expect(castTo<SettingTabsHolder>(plugin).settingTabs__).toHaveLength(1);
    });

    it('should register loadSettings and saveSettings handlers', async () => {
      await createLoadedPlugin();
      expect(hoisted.capturedLoadSettingsHandlers).toHaveLength(1);
      expect(hoisted.capturedSaveSettingsHandlers).toHaveLength(1);
    });

    it('should not rebuild handlers on the initial loadSettings', async () => {
      await createLoadedPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.(undefined, true);
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.isNote('note.md')).toBe(true);
    });

    it('should rebuild handlers on a non-initial loadSettings', async () => {
      await createLoadedPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.(undefined, false);
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.isNote('note.md')).toBe(true);
    });

    it('should rebuild handlers on saveSettings', async () => {
      await createLoadedPlugin();
      const handler = hoisted.capturedSaveSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.();
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.isNote('note.md')).toBe(true);
    });
  });

  describe('rename-delete settings builder', () => {
    it('should build settings from the plugin settings', async () => {
      await createLoadedPlugin();
      const settings = getRegisteredSettingsBuilder()();
      expect(settings).toMatchObject({
        emptyFolderBehavior: 'DeleteWithEmptyParents',
        shouldDeleteConflictingAttachments: false,
        shouldHandleDeletions: false,
        shouldHandleRenames: true,
        shouldRenameAttachmentFolder: false,
        shouldUpdateFileNameAliases: true
      });
    });

    it('should expose isNote that delegates to the files handler', async () => {
      await createLoadedPlugin();
      hoisted.mockFilesHandlerInstance.isNoteEx.mockReturnValue(false);
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.isNote('note.md')).toBe(false);
      expect(hoisted.mockFilesHandlerInstance.isNoteEx).toHaveBeenCalledWith('note.md');
    });

    it('should expose isPathIgnored that delegates to the settings', async () => {
      await createLoadedPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      const settings = getRegisteredSettingsBuilder()();
      expect(settings.isPathIgnored('note.md')).toBe(true);
      expect(hoisted.mockSettings.isPathIgnored).toHaveBeenCalledWith('note.md');
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
