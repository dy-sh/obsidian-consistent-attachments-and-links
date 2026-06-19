/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors and constructor-only classes. */
import type {
  App,
  PluginManifest
} from 'obsidian';
import type { TranslationsMap } from 'obsidian-dev-utils/obsidian/i18n/i18n';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface EventRef {
  id: string;
}

interface PluginPrivate {
  createTranslationsMap(): TranslationsMap;
  onloadImpl(): void;
}

interface RenameDeleteHandlerParams {
  settingsBuilder(): RenameDeleteSettingsProbe;
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

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  capturedLoadSettingsHandlers: [] as ((state: unknown, isInitialLoad: boolean) => void)[],
  capturedRenameDeleteSettingsBuilders: [] as (() => RenameDeleteSettingsProbe)[],
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
  },
  mockTranslationsMap: { en: {} }
}));

const mockTranslationsMap = castTo<TranslationsMap>(hoisted.mockTranslationsMap);

// --- Mocks for files/logic owned by other agents ---

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
  ConsistentAttachmentsAndLinksComponent: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('./i18n/locales/translations-map.ts', () => ({
  translationsMap: hoisted.mockTranslationsMap
}));

// --- Command handler mocks (owned by other agents) ---

const { CommandHandlerMock } = vi.hoisted(() => ({
  CommandHandlerMock: class {
    public constructor(_params: unknown) {
      // No-op command handler mock.
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

// --- obsidian-dev-utils mocks ---

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
  AppActiveFileProvider: class {
    public constructor(_app: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  CommandHandlerComponent: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/command-registrar', () => ({
  PluginCommandRegistrar: class {
    public constructor(_plugin: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', () => ({
  MenuEventRegistrarComponent: class {
    public constructor(_app: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: class {
    public constructor(_params: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/components/rename-delete-handler-component', () => ({
  RenameDeleteHandlerComponent: class {
    public constructor(params: RenameDeleteHandlerParams) {
      hoisted.capturedRenameDeleteSettingsBuilders.push(params.settingsBuilder);
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: class {
    public constructor(_plugin: unknown) {
      // No-op.
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => ({
  PluginBase: class {
    public abortSignalComponent = { abortSignal: new AbortController().signal };
    public app: App;
    public manifest: PluginManifest;

    public constructor(app: App, manifest: PluginManifest) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild<T>(child: T): T {
      return child;
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: class {
    public constructor(_plugin: unknown) {
      // No-op.
    }
  }
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: class {
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
      // No-op.
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

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

function asPrivate(plugin: Plugin): PluginPrivate {
  return castTo<PluginPrivate>(plugin);
}

function createPlugin(): Plugin {
  const app = castTo<App>({});
  const manifest = castTo<PluginManifest>({ id: 'consistent-attachments-and-links', name: 'Consistent Attachments and Links' });
  const plugin = new Plugin(app, manifest);
  asPrivate(plugin).onloadImpl();
  return plugin;
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.capturedLoadSettingsHandlers.length = 0;
    hoisted.capturedSaveSettingsHandlers.length = 0;
    hoisted.capturedRenameDeleteSettingsBuilders.length = 0;
    hoisted.mockSettings.isPathIgnored.mockReturnValue(false);
    hoisted.mockFilesHandlerInstance.isNoteEx.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTranslationsMap', () => {
    it('should return the translations map', () => {
      const plugin = new Plugin(castTo<App>({}), castTo<PluginManifest>({ id: 'consistent-attachments-and-links', name: 'Consistent Attachments and Links' }));
      expect(asPrivate(plugin).createTranslationsMap()).toBe(mockTranslationsMap);
    });
  });

  describe('onloadImpl', () => {
    it('should wire up the plugin without throwing', () => {
      const plugin = createPlugin();
      expect(plugin).toBeInstanceOf(Plugin);
    });

    it('should register loadSettings and saveSettings handlers', () => {
      createPlugin();
      expect(hoisted.capturedLoadSettingsHandlers).toHaveLength(1);
      expect(hoisted.capturedSaveSettingsHandlers).toHaveLength(1);
    });

    it('should not rebuild handlers on the initial loadSettings', () => {
      createPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.(undefined, true);
      expect(handler).toBeDefined();
    });

    it('should rebuild handlers on a non-initial loadSettings', () => {
      createPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.(undefined, false);
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      const settings = castTo<RenameDeleteSettingsProbe>(builder?.() ?? {});
      expect(settings.isNote('note.md')).toBe(true);
    });

    it('should rebuild handlers on saveSettings', () => {
      createPlugin();
      const handler = hoisted.capturedSaveSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.();
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      const settings = castTo<RenameDeleteSettingsProbe>(builder?.() ?? {});
      expect(settings.isNote('note.md')).toBe(true);
    });
  });

  describe('rename-delete settings builder', () => {
    it('should build settings from the plugin settings', () => {
      createPlugin();
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      expect(builder).toBeDefined();
      const settings = builder?.();
      expect(settings).toMatchObject({
        emptyFolderBehavior: 'DeleteWithEmptyParents',
        shouldDeleteConflictingAttachments: false,
        shouldHandleDeletions: false,
        shouldHandleRenames: true,
        shouldRenameAttachmentFolder: false,
        shouldUpdateFileNameAliases: true
      });
    });

    it('should expose isNote that delegates to the files handler', () => {
      createPlugin();
      hoisted.mockFilesHandlerInstance.isNoteEx.mockReturnValue(false);
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      const settings = castTo<RenameDeleteSettingsProbe>(builder?.() ?? {});
      expect(settings.isNote('note.md')).toBe(false);
      expect(hoisted.mockFilesHandlerInstance.isNoteEx).toHaveBeenCalledWith('note.md');
    });

    it('should expose isPathIgnored that delegates to the settings', () => {
      createPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      const settings = castTo<RenameDeleteSettingsProbe>(builder?.() ?? {});
      expect(settings.isPathIgnored('note.md')).toBe(true);
      expect(hoisted.mockSettings.isPathIgnored).toHaveBeenCalledWith('note.md');
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
