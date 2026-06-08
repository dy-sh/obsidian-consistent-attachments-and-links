/* eslint-disable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- Test mocks require empty constructors and constructor-only classes. */
import type {
  App,
  CachedMetadata,
  PluginManifest,
  TFile
} from 'obsidian';

import {
  MarkdownView,
  Notice
} from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettings } from './plugin-settings.ts';

import {
  collectAttachmentsEntireVault,
  collectAttachmentsInAbstractFiles
} from './attachment-collector.ts';

interface AddToQueueParams {
  operationFn(abortSignal: AbortSignal): unknown;
}

interface DisplayTextLeaf {
  getDisplayText(): string;
}

interface EventRef {
  id: string;
}

interface LoopParams {
  buildNoticeMessage?(item: TFile, iterationStr: string): string;
  readonly items: TFile[];
  processItem(item: TFile): Promise<void> | void;
}

interface MockApp {
  metadataCache: MockAppMetadataCache;
  vault: MockAppVault;
  workspace: MockAppWorkspace;
}

interface MockAppMetadataCache {
  on: ReturnType<typeof vi.fn>;
}

interface MockAppVault {
  modify: ReturnType<typeof vi.fn>;
}

interface MockAppWorkspace {
  getLeavesOfType: ReturnType<typeof vi.fn>;
  iterateAllLeaves: ReturnType<typeof vi.fn>;
  onLayoutReady: ReturnType<typeof vi.fn>;
  openLinkText: ReturnType<typeof vi.fn>;
}

interface PluginPrivate {
  handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void;
  handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): void;
  saveAllOpenNotes(): Promise<void>;
  showBackupWarning(): Promise<void>;
}

interface RenameDeleteHandlerParams {
  settingsBuilder(): object;
}

interface RenameDeleteSettingsProbe {
  isNote(path: string): boolean;
  isPathIgnored(path: string): boolean;
}

interface SavableView {
  save(): Promise<void>;
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  capturedLoadSettingsHandlers: [] as ((state: unknown, isInitialLoad: boolean) => void)[],
  capturedRenameDeleteSettingsBuilders: [] as (() => object)[],
  capturedSaveSettingsHandlers: [] as (() => void)[],
  layoutReadyCallbacks: [] as (() => void)[],
  metadataCacheHandlers: new Map<string, (...args: unknown[]) => void>(),
  mockAddToQueue: vi.fn((params: AddToQueueParams): void => {
    params.operationFn(new AbortController().signal);
  }),
  mockAlert: vi.fn((..._args: unknown[]): Promise<void> => noopAsync()),
  mockCreateFolderSafe: vi.fn((..._args: unknown[]): Promise<void> => noopAsync()),
  mockFilesHandlerInstance: {
    deleteEmptyFolders: vi.fn((): Promise<void> => noopAsync()),
    isNoteEx: vi.fn((): boolean => true)
  },
  mockGetMarkdownFilesSorted: vi.fn((): TFile[] => []),
  mockGetOrCreateFile: vi.fn((..._args: unknown[]): Promise<TFile> => Promise.resolve(strictProxy<TFile>({ path: 'report.md' }))),
  mockInitI18N: vi.fn((..._args: unknown[]): Promise<void> => noopAsync()),
  mockLinksHandlerInstance: {
    checkConsistency: vi.fn((): Promise<void> => noopAsync()),
    convertAllNoteEmbedsPathsToRelative: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
    convertAllNoteLinksPathsToRelative: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
    replaceAllNoteWikilinksWithMarkdownLinks: vi.fn((): Promise<number> => Promise.resolve(0))
  },
  mockSettings: {
    consistencyReportFile: 'report.md',
    emptyFolderBehavior: 'DeleteWithEmptyParents',
    hadDangerousSettingsReverted: false,
    isPathIgnored: vi.fn(() => false),
    revertDangerousSettings: vi.fn(),
    shouldChangeNoteBacklinksDisplayText: true,
    shouldCollectAttachmentsAutomatically: false,
    shouldDeleteAttachmentsWithNote: false,
    shouldDeleteExistingFilesWhenMovingNote: false,
    shouldMoveAttachmentsWithNote: false,
    shouldShowBackupWarning: true,
    shouldUpdateLinks: true
  }
}));

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

// --- Mocks for files/logic owned by other agents ---

vi.mock('./links-handler.ts', () => ({
  ConsistencyCheckResult: class {
    public constructor(public readonly title: string) {}

    public toString(): string {
      return `${this.title}\n`;
    }
  },
  LinksHandler: class {
    public checkConsistency = hoisted.mockLinksHandlerInstance.checkConsistency;
    public convertAllNoteEmbedsPathsToRelative = hoisted.mockLinksHandlerInstance.convertAllNoteEmbedsPathsToRelative;
    public convertAllNoteLinksPathsToRelative = hoisted.mockLinksHandlerInstance.convertAllNoteLinksPathsToRelative;
    public replaceAllNoteWikilinksWithMarkdownLinks = hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks;
  }
}));

vi.mock('./files-handler.ts', () => ({
  FilesHandler: class {
    public deleteEmptyFolders = hoisted.mockFilesHandlerInstance.deleteEmptyFolders;
    public isNoteEx = hoisted.mockFilesHandlerInstance.isNoteEx;
  }
}));

vi.mock('./attachment-collector.ts', () => ({
  collectAttachmentsEntireVault: vi.fn(),
  collectAttachmentsInAbstractFiles: vi.fn()
}));

// --- Command handler mocks (owned by other agents) ---

const { CommandHandlerMock } = vi.hoisted(() => ({
  CommandHandlerMock: class {
    public constructor(_plugin: unknown) {
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

vi.mock('obsidian-dev-utils/async', () => ({
  invokeAsyncSafely: vi.fn((fn: () => Promise<void>): void => {
    fn().catch((): void => undefined);
  })
}));

vi.mock('obsidian-dev-utils/function', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian-dev-utils/function')>();
  return {
    ...original,
    omitAsyncReturnType: vi.fn((fn: (abortSignal: AbortSignal) => Promise<unknown>) => fn)
  };
});

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

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getOrCreateFile: (...args: unknown[]): Promise<TFile> => hoisted.mockGetOrCreateFile(...args),
  isMarkdownFile: vi.fn(() => true)
}));

vi.mock('obsidian-dev-utils/obsidian/i18n/i18n', () => ({
  initI18N: (...args: unknown[]): Promise<void> => hoisted.mockInitI18N(...args)
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn(async (params: LoopParams): Promise<void> => {
    for (const item of params.items) {
      params.buildNoticeMessage?.(item, '1/1');
      await params.processItem(item);
    }
  })
}));

vi.mock('obsidian-dev-utils/obsidian/modals/alert', () => ({
  alert: (...args: unknown[]): Promise<void> => hoisted.mockAlert(...args)
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

    public registerEvent(_ref: unknown): void {
      // No-op.
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

vi.mock('obsidian-dev-utils/obsidian/queue', () => ({
  addToQueue: (params: AddToQueueParams): void => {
    hoisted.mockAddToQueue(params);
  }
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  createFolderSafe: (...args: unknown[]): Promise<void> => hoisted.mockCreateFolderSafe(...args),
  getMarkdownFilesSorted: (): TFile[] => hoisted.mockGetMarkdownFilesSorted()
}));

vi.mock('obsidian-dev-utils/path', () => ({
  dirname: vi.fn((path: string) => {
    const index = path.lastIndexOf('/');
    return index >= 0 ? path.slice(0, index) : '';
  })
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: class {
    public editAndSave = vi.fn((editor: (settings: PluginSettings) => void): Promise<void> => {
      editor(castTo<PluginSettings>(hoisted.mockSettings));
      return noopAsync();
    });

    public on = vi.fn((event: string, handler: (...args: unknown[]) => void): EventRef => {
      if (event === 'loadSettings') {
        hoisted.capturedLoadSettingsHandlers.push(handler);
      } else {
        hoisted.capturedSaveSettingsHandlers.push(handler);
      }
      return { id: `${event}-ref` };
    });

    public settings = hoisted.mockSettings;
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

function createMockApp(): MockApp {
  return {
    metadataCache: {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void): EventRef => {
        hoisted.metadataCacheHandlers.set(event, handler);
        return { id: `${event}-ref` };
      })
    },
    vault: {
      modify: vi.fn((): Promise<void> => noopAsync())
    },
    workspace: {
      getLeavesOfType: vi.fn((): unknown[] => []),
      iterateAllLeaves: vi.fn(),
      onLayoutReady: vi.fn((callback: () => void): void => {
        hoisted.layoutReadyCallbacks.push(callback);
      }),
      openLinkText: vi.fn((): Promise<void> => noopAsync())
    }
  };
}

function createPlugin(): Plugin {
  const app = createMockApp();
  const manifest = castTo<PluginManifest>({ id: 'consistent-attachments-and-links', name: 'Consistent Attachments and Links' });
  return new Plugin(castTo<App>(app), manifest);
}

// --- Tests ---

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.capturedLoadSettingsHandlers.length = 0;
    hoisted.capturedSaveSettingsHandlers.length = 0;
    hoisted.capturedRenameDeleteSettingsBuilders.length = 0;
    hoisted.layoutReadyCallbacks.length = 0;
    hoisted.metadataCacheHandlers.clear();
    hoisted.mockGetMarkdownFilesSorted.mockReturnValue([]);
    hoisted.mockSettings.isPathIgnored.mockReturnValue(false);
    hoisted.mockSettings.shouldShowBackupWarning = true;
    hoisted.mockSettings.shouldCollectAttachmentsAutomatically = false;
    hoisted.mockSettings.shouldDeleteAttachmentsWithNote = false;
    hoisted.mockSettings.hadDangerousSettingsReverted = false;
    hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks.mockResolvedValue(0);
    hoisted.mockLinksHandlerInstance.convertAllNoteEmbedsPathsToRelative.mockResolvedValue([]);
    hoisted.mockLinksHandlerInstance.convertAllNoteLinksPathsToRelative.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a plugin instance', () => {
      const plugin = createPlugin();
      expect(plugin).toBeInstanceOf(Plugin);
    });

    it('should initialize i18n', () => {
      createPlugin();
      expect(hoisted.mockInitI18N).toHaveBeenCalled();
    });

    it('should register a layout-ready handler', () => {
      createPlugin();
      expect(hoisted.layoutReadyCallbacks).toHaveLength(1);
    });

    it('should build rename-delete settings from the plugin settings', () => {
      createPlugin();
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      expect(builder).toBeDefined();
      const settings = builder?.();
      expect(settings).toMatchObject({
        shouldHandleRenames: true,
        shouldUpdateFileNameAliases: true
      });
    });

    it('should expose isNote and isPathIgnored through the rename-delete settings builder', () => {
      createPlugin();
      const builder = hoisted.capturedRenameDeleteSettingsBuilders[0];
      const settings = castTo<RenameDeleteSettingsProbe>(builder?.() ?? {});
      expect(settings.isNote('note.md')).toBe(true);
      expect(settings.isPathIgnored('note.md')).toBe(false);
    });

    it('should rebuild handlers on non-initial loadSettings', () => {
      createPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.(undefined, false);
      expect(hoisted.mockFilesHandlerInstance.isNoteEx).not.toThrow();
    });

    it('should not rebuild handlers on initial loadSettings', () => {
      createPlugin();
      const handler = hoisted.capturedLoadSettingsHandlers[0];
      handler?.(undefined, true);
      expect(handler).toBeDefined();
    });

    it('should rebuild handlers on saveSettings', () => {
      createPlugin();
      const handler = hoisted.capturedSaveSettingsHandlers[0];
      expect(handler).toBeDefined();
      handler?.();
      expect(handler).toBeDefined();
    });
  });

  describe('abortSignal', () => {
    it('should return an abort signal', () => {
      const plugin = createPlugin();
      expect(plugin.abortSignal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('checkConsistency', () => {
    it('should write the consistency report and open it when not already open', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.checkConsistency();
      expect(hoisted.mockLinksHandlerInstance.checkConsistency).toHaveBeenCalled();
      expect(hoisted.mockCreateFolderSafe).toHaveBeenCalled();
      const app = castTo<MockApp>(plugin.app);
      expect(app.workspace.openLinkText).toHaveBeenCalledWith('report.md', '/', false);
    });

    it('should not reopen the report when it is already open', async () => {
      const plugin = createPlugin();
      const app = castTo<MockApp>(plugin.app);
      app.workspace.iterateAllLeaves.mockImplementation((cb: (leaf: DisplayTextLeaf) => void) => {
        cb({ getDisplayText: () => 'report.md' });
      });
      await plugin.checkConsistency();
      expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it('should ignore leaves with an empty display text', async () => {
      const plugin = createPlugin();
      const app = castTo<MockApp>(plugin.app);
      app.workspace.iterateAllLeaves.mockImplementation((cb: (leaf: DisplayTextLeaf) => void) => {
        cb({ getDisplayText: () => '' });
      });
      await plugin.checkConsistency();
      expect(app.workspace.openLinkText).toHaveBeenCalled();
    });
  });

  describe('convertAllEmbedsPathsToRelative', () => {
    it('should show a "no embeds" notice when nothing changed', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('No embeds found that need to be converted');
    });

    it('should skip ignored notes', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.convertAllEmbedsPathsToRelative();
      expect(hoisted.mockLinksHandlerInstance.convertAllNoteEmbedsPathsToRelative).not.toHaveBeenCalled();
    });

    it('should report converted embeds across notes (plural)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      hoisted.mockLinksHandlerInstance.convertAllNoteEmbedsPathsToRelative.mockResolvedValue(['x', 'y']);
      await plugin.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('Converted 4 embeds from 2 notes');
    });

    it('should report a single converted embed (singular)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      hoisted.mockLinksHandlerInstance.convertAllNoteEmbedsPathsToRelative.mockResolvedValue(['x']);
      await plugin.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('Converted 1 embed from 1 note');
    });
  });

  describe('convertAllEmbedsPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', () => {
      const plugin = createPlugin();
      plugin.convertAllEmbedsPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('convertAllLinkPathsToRelative', () => {
    it('should show a "no links" notice when nothing changed', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('No links found that need to be converted');
    });

    it('should skip ignored notes', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(hoisted.mockLinksHandlerInstance.convertAllNoteLinksPathsToRelative).not.toHaveBeenCalled();
    });

    it('should report converted links (plural)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      hoisted.mockLinksHandlerInstance.convertAllNoteLinksPathsToRelative.mockResolvedValue(['x', 'y']);
      await plugin.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('Converted 4 links from 2 notes');
    });

    it('should report a single converted link (singular)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      hoisted.mockLinksHandlerInstance.convertAllNoteLinksPathsToRelative.mockResolvedValue(['x']);
      await plugin.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('Converted 1 link from 1 note');
    });

    it('should throw when the abort signal is already aborted', async () => {
      const plugin = createPlugin();
      const controller = new AbortController();
      controller.abort();
      await expect(plugin.convertAllLinkPathsToRelative(controller.signal)).rejects.toThrow();
    });
  });

  describe('convertAllLinkPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', () => {
      const plugin = createPlugin();
      plugin.convertAllLinkPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('deleteEmptyFolders', () => {
    it('should delegate to the files handler', async () => {
      const plugin = createPlugin();
      await plugin.deleteEmptyFolders();
      expect(hoisted.mockFilesHandlerInstance.deleteEmptyFolders).toHaveBeenCalledWith('/');
    });
  });

  describe('reorganizeVault', () => {
    it('should run the full reorganization pipeline', async () => {
      const plugin = createPlugin();
      await plugin.reorganizeVault();
      expect(collectAttachmentsEntireVault).toHaveBeenCalledWith(plugin);
      expect(hoisted.mockFilesHandlerInstance.deleteEmptyFolders).toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith('Reorganization of the vault completed');
    });
  });

  describe('replaceAllWikiEmbedsWithMarkdownEmbeds', () => {
    it('should show a "no wiki embeds" notice when nothing changed', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('No wiki embeds found that need to be replaced');
    });

    it('should skip ignored notes', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks).not.toHaveBeenCalled();
    });

    it('should report replaced wiki embeds (plural)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks.mockResolvedValue(2);
      await plugin.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('Replaced 4 wiki embeds from 2 notes');
    });

    it('should report a single replaced wiki embed (singular)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks.mockResolvedValue(1);
      await plugin.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('Replaced 1 wiki embed from 1 note');
    });
  });

  describe('replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote', () => {
    it('should enqueue the replacement for the current note', () => {
      const plugin = createPlugin();
      plugin.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('replaceAllWikilinksWithMarkdownLinks', () => {
    it('should show a "no wiki links" notice when nothing changed', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('No wiki links found that need to be replaced');
    });

    it('should skip ignored notes', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await plugin.replaceAllWikilinksWithMarkdownLinks();
      expect(hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks).not.toHaveBeenCalled();
    });

    it('should report replaced wikilinks (plural)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks.mockResolvedValue(2);
      await plugin.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('Replaced 4 wikilinks from 2 notes');
    });

    it('should report a single replaced wikilink (singular)', async () => {
      const plugin = createPlugin();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      hoisted.mockLinksHandlerInstance.replaceAllNoteWikilinksWithMarkdownLinks.mockResolvedValue(1);
      await plugin.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('Replaced 1 wikilink from 1 note');
    });
  });

  describe('replaceAllWikilinksWithMarkdownLinksCurrentNote', () => {
    it('should enqueue the replacement for the current note', () => {
      const plugin = createPlugin();
      plugin.replaceAllWikilinksWithMarkdownLinksCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('saveAllOpenNotes', () => {
    it('should save dirty markdown views', async () => {
      const plugin = createPlugin();
      const save = vi.fn((): Promise<void> => noopAsync());
      const view = castTo<SavableView>(Object.create(MarkdownView.prototype));
      view.save = save;
      const app = castTo<MockApp>(plugin.app);
      app.workspace.getLeavesOfType.mockReturnValue([{ view }]);
      await asPrivate(plugin).saveAllOpenNotes();
      expect(save).toHaveBeenCalled();
    });

    it('should ignore leaves that are not markdown views', async () => {
      const plugin = createPlugin();
      const app = castTo<MockApp>(plugin.app);
      app.workspace.getLeavesOfType.mockReturnValue([{ view: {} }]);
      await asPrivate(plugin).saveAllOpenNotes();
      expect(app.workspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
    });
  });

  describe('handleDeletedMetadata', () => {
    it('should cache the previous metadata for a markdown note', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldDeleteAttachmentsWithNote = true;
      expect(() => {
        asPrivate(plugin).handleDeletedMetadata(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      }).not.toThrow();
    });

    it('should ignore deletions when shouldDeleteAttachmentsWithNote is false', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldDeleteAttachmentsWithNote = false;
      expect(() => {
        asPrivate(plugin).handleDeletedMetadata(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      }).not.toThrow();
    });
  });

  describe('handleMetadataCacheChanged', () => {
    it('should collect attachments when automatic collecting is enabled', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldCollectAttachmentsAutomatically = true;
      const file = strictProxy<TFile>({ path: 'note.md' });
      asPrivate(plugin).handleMetadataCacheChanged(file, new AbortController().signal);
      expect(collectAttachmentsInAbstractFiles).toHaveBeenCalledWith(plugin, [file]);
    });

    it('should do nothing when automatic collecting is disabled', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldCollectAttachmentsAutomatically = false;
      asPrivate(plugin).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), new AbortController().signal);
      expect(collectAttachmentsInAbstractFiles).not.toHaveBeenCalled();
    });

    it('should skip collecting when a suggestion container is shown', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldCollectAttachmentsAutomatically = true;
      const container = activeDocument.createElement('div');
      container.addClass('suggestion-container');
      activeDocument.body.appendChild(container);
      vi.spyOn(container, 'isShown').mockReturnValue(true);
      asPrivate(plugin).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), new AbortController().signal);
      container.remove();
      expect(collectAttachmentsInAbstractFiles).not.toHaveBeenCalled();
    });

    it('should throw when the abort signal is aborted', () => {
      const plugin = createPlugin();
      const controller = new AbortController();
      controller.abort();
      expect(() => {
        asPrivate(plugin).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), controller.signal);
      }).toThrow();
    });
  });

  describe('layout-ready handlers', () => {
    it('should register metadata-cache deleted and changed handlers', () => {
      const plugin = createPlugin();
      const app = castTo<MockApp>(plugin.app);
      const callback = hoisted.layoutReadyCallbacks[0];
      callback?.();
      expect(app.metadataCache.on).toHaveBeenCalledWith('deleted', expect.any(Function));
      expect(app.metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));
    });

    it('should handle the deleted event with a previous cache', () => {
      createPlugin();
      hoisted.mockSettings.shouldDeleteAttachmentsWithNote = true;
      hoisted.layoutReadyCallbacks[0]?.();
      const deletedHandler = hoisted.metadataCacheHandlers.get('deleted');
      expect(deletedHandler).toBeDefined();
      deletedHandler?.(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      expect(deletedHandler).toBeDefined();
    });

    it('should ignore the deleted event with no previous cache', () => {
      createPlugin();
      hoisted.layoutReadyCallbacks[0]?.();
      const deletedHandler = hoisted.metadataCacheHandlers.get('deleted');
      deletedHandler?.(strictProxy<TFile>({ path: 'note.md' }), null);
      expect(deletedHandler).toBeDefined();
    });

    it('should enqueue handling for the changed event', () => {
      createPlugin();
      hoisted.mockSettings.shouldCollectAttachmentsAutomatically = false;
      hoisted.layoutReadyCallbacks[0]?.();
      const changedHandler = hoisted.metadataCacheHandlers.get('changed');
      expect(changedHandler).toBeDefined();
      changedHandler?.(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('showBackupWarning', () => {
    it('should not warn when the backup warning is disabled', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldShowBackupWarning = false;
      await asPrivate(plugin).showBackupWarning();
      expect(hoisted.mockAlert).not.toHaveBeenCalled();
    });

    it('should warn, revert dangerous settings and disable the warning', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldShowBackupWarning = true;
      await asPrivate(plugin).showBackupWarning();
      expect(hoisted.mockSettings.revertDangerousSettings).toHaveBeenCalled();
      expect(hoisted.mockAlert).toHaveBeenCalled();
    });

    it('should mention reverted settings in the warning when they were reverted', async () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldShowBackupWarning = true;
      hoisted.mockSettings.hadDangerousSettingsReverted = true;
      await asPrivate(plugin).showBackupWarning();
      expect(hoisted.mockAlert).toHaveBeenCalled();
    });

    it('should be invoked from the layout-ready handler', () => {
      const plugin = createPlugin();
      hoisted.mockSettings.shouldShowBackupWarning = false;
      hoisted.layoutReadyCallbacks[0]?.();
      expect(plugin).toBeInstanceOf(Plugin);
    });
  });
});
/* eslint-enable @typescript-eslint/no-extraneous-class, @typescript-eslint/no-useless-constructor -- End of test file. */
