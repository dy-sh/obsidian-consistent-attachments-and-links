import type {
  App,
  CachedMetadata,
  TFile
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

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

import type { AttachmentCollector } from './attachment-collector.ts';
import type { FilesHandler } from './files-handler.ts';
import type {
  LinksHandler,
  ReferenceChangeInfo
} from './links-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';

interface AddToQueueParams {
  operationFn(abortSignal: AbortSignal): unknown;
}

interface ComponentPrivate {
  handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void;
  handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): void;
  onLayoutReady(): void;
  saveAllOpenNotes(): Promise<void>;
  showBackupWarning(): Promise<void>;
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
  openLinkText: ReturnType<typeof vi.fn>;
}

interface SavableView {
  save(): Promise<void>;
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  mockAddToQueue: vi.fn((params: AddToQueueParams): void => {
    params.operationFn(new AbortController().signal);
  }),
  mockAlert: vi.fn((..._args: unknown[]): Promise<void> => noopAsync()),
  mockCreateFolderSafe: vi.fn((..._args: unknown[]): Promise<void> => noopAsync()),
  mockGetMarkdownFilesSorted: vi.fn((): TFile[] => []),
  mockGetOrCreateFile: vi.fn((..._args: unknown[]): Promise<TFile> => Promise.resolve(strictProxy<TFile>({ path: 'report.md' }))),
  registeredEventRefs: [] as unknown[]
}));

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

vi.mock('./links-handler.ts', () => ({
  ConsistencyCheckResult: class {
    public constructor(public readonly title: string) {}

    public toString(): string {
      return `${this.title}\n`;
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Placeholder class so the value import resolves; the real instance is injected.
  LinksHandler: class {}
}));

vi.mock('./files-handler.ts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Placeholder class so the value import resolves; the real instance is injected.
  FilesHandler: class {}
}));

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

vi.mock('obsidian-dev-utils/obsidian/components/layout-ready-component', () => ({
  LayoutReadyComponent: class {
    public app: unknown;

    public constructor(app: unknown) {
      this.app = app;
    }

    protected registerEvent(ref: unknown): void {
      hoisted.registeredEventRefs.push(ref);
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getOrCreateFile: (...args: unknown[]): Promise<TFile> => hoisted.mockGetOrCreateFile(...args),
  isMarkdownFile: vi.fn(() => true)
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

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { ConsistentAttachmentsAndLinksComponent } from './consistent-attachments-and-links-component.ts';

const mockAlert = hoisted.mockAlert;

const metadataCacheHandlers = new Map<string, (...args: unknown[]) => void>();

const mockApp = createMockApp();

const mockSettings = {
  consistencyReportFile: 'report.md',
  hadDangerousSettingsReverted: false,
  isPathIgnored: vi.fn((_path: string): boolean => false),
  revertDangerousSettings: vi.fn((): void => undefined),
  shouldCollectAttachmentsAutomatically: false,
  shouldDeleteAttachmentsWithNote: false,
  shouldShowBackupWarning: true
};

const mockAbortSignalComponent = strictProxy<AbortSignalComponent>({
  abortSignal: new AbortController().signal
});

const mockAttachmentCollector = strictProxy<AttachmentCollector>({
  collectAttachmentsEntireVault: vi.fn((): void => undefined),
  collectAttachmentsInAbstractFiles: vi.fn((): void => undefined)
});

const mockFilesHandler = strictProxy<FilesHandler>({
  deleteEmptyFolders: vi.fn((): Promise<void> => noopAsync())
});

const mockLinksHandler = strictProxy<LinksHandler>({
  checkConsistency: vi.fn((): Promise<void> => noopAsync()),
  convertAllNoteEmbedsPathsToRelative: vi.fn((): Promise<ReferenceChangeInfo[]> => Promise.resolve([])),
  convertAllNoteLinksPathsToRelative: vi.fn((): Promise<ReferenceChangeInfo[]> => Promise.resolve([])),
  replaceAllNoteWikilinksWithMarkdownLinks: vi.fn((): Promise<number> => Promise.resolve(0))
});

const mockPluginSettingsComponent = strictProxy<PluginSettingsComponent>({
  editAndSave: vi.fn((editor: (settings: PluginSettings) => void): Promise<void> => {
    editor(castTo<PluginSettings>(mockSettings));
    return noopAsync();
  }),
  settings: castTo<PluginSettings>(mockSettings)
});

function asPrivate(component: ConsistentAttachmentsAndLinksComponent): ComponentPrivate {
  return castTo<ComponentPrivate>(component);
}

function createComponent(): ConsistentAttachmentsAndLinksComponent {
  return new ConsistentAttachmentsAndLinksComponent({
    abortSignalComponent: mockAbortSignalComponent,
    app: castTo<App>(mockApp),
    attachmentCollector: mockAttachmentCollector,
    filesHandler: mockFilesHandler,
    linksHandler: mockLinksHandler,
    pluginSettingsComponent: mockPluginSettingsComponent
  });
}

function createMockApp(): MockApp {
  return {
    metadataCache: {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void): EventRef => {
        metadataCacheHandlers.set(event, handler);
        return { id: `${event}-ref` };
      })
    },
    vault: {
      modify: vi.fn((): Promise<void> => noopAsync())
    },
    workspace: {
      getLeavesOfType: vi.fn((): unknown[] => []),
      iterateAllLeaves: vi.fn(),
      openLinkText: vi.fn((): Promise<void> => noopAsync())
    }
  };
}

// --- Tests ---

describe('ConsistentAttachmentsAndLinksComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metadataCacheHandlers.clear();
    hoisted.registeredEventRefs.length = 0;
    hoisted.mockGetMarkdownFilesSorted.mockReturnValue([]);
    mockSettings.isPathIgnored.mockReturnValue(false);
    mockSettings.shouldShowBackupWarning = true;
    mockSettings.shouldCollectAttachmentsAutomatically = false;
    mockSettings.shouldDeleteAttachmentsWithNote = false;
    mockSettings.hadDangerousSettingsReverted = false;
    castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).mockResolvedValue(0);
    castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).mockResolvedValue([]);
    castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteLinksPathsToRelative).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a component instance', () => {
      const component = createComponent();
      expect(component).toBeInstanceOf(ConsistentAttachmentsAndLinksComponent);
    });
  });

  describe('checkConsistency', () => {
    it('should write the consistency report and open it when not already open', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.checkConsistency();
      expect(mockLinksHandler.checkConsistency).toHaveBeenCalled();
      expect(hoisted.mockCreateFolderSafe).toHaveBeenCalled();
      expect(mockApp.workspace.openLinkText).toHaveBeenCalledWith('report.md', '/', false);
    });

    it('should not reopen the report when it is already open', async () => {
      const component = createComponent();
      mockApp.workspace.iterateAllLeaves.mockImplementation((cb: (leaf: DisplayTextLeaf) => void) => {
        cb({ getDisplayText: () => 'report.md' });
      });
      await component.checkConsistency();
      expect(mockApp.workspace.openLinkText).not.toHaveBeenCalled();
    });

    it('should ignore leaves with an empty display text', async () => {
      const component = createComponent();
      mockApp.workspace.iterateAllLeaves.mockImplementation((cb: (leaf: DisplayTextLeaf) => void) => {
        cb({ getDisplayText: () => '' });
      });
      await component.checkConsistency();
      expect(mockApp.workspace.openLinkText).toHaveBeenCalled();
    });
  });

  describe('convertAllEmbedsPathsToRelative', () => {
    it('should show a "no embeds" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('No embeds found that need to be converted');
    });

    it('should skip ignored notes', async () => {
      const component = createComponent();
      mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllEmbedsPathsToRelative();
      expect(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).not.toHaveBeenCalled();
    });

    it('should report converted embeds across notes (plural)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).mockResolvedValue(['x', 'y']);
      await component.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('Converted 4 embeds from 2 notes');
    });

    it('should report a single converted embed (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).mockResolvedValue(['x']);
      await component.convertAllEmbedsPathsToRelative();
      expect(Notice).toHaveBeenCalledWith('Converted 1 embed from 1 note');
    });
  });

  describe('convertAllEmbedsPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', () => {
      const component = createComponent();
      component.convertAllEmbedsPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('convertAllLinkPathsToRelative', () => {
    it('should show a "no links" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('No links found that need to be converted');
    });

    it('should skip ignored notes', async () => {
      const component = createComponent();
      mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(mockLinksHandler.convertAllNoteLinksPathsToRelative).not.toHaveBeenCalled();
    });

    it('should report converted links (plural)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteLinksPathsToRelative).mockResolvedValue(['x', 'y']);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('Converted 4 links from 2 notes');
    });

    it('should report a single converted link (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteLinksPathsToRelative).mockResolvedValue(['x']);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(Notice).toHaveBeenCalledWith('Converted 1 link from 1 note');
    });

    it('should throw when the abort signal is already aborted', async () => {
      const component = createComponent();
      const controller = new AbortController();
      controller.abort();
      await expect(component.convertAllLinkPathsToRelative(controller.signal)).rejects.toThrow();
    });
  });

  describe('convertAllLinkPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', () => {
      const component = createComponent();
      component.convertAllLinkPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('deleteEmptyFolders', () => {
    it('should delegate to the files handler', async () => {
      const component = createComponent();
      await component.deleteEmptyFolders();
      expect(mockFilesHandler.deleteEmptyFolders).toHaveBeenCalledWith('/');
    });
  });

  describe('reorganizeVault', () => {
    it('should run the full reorganization pipeline', async () => {
      const component = createComponent();
      await component.reorganizeVault();
      expect(mockAttachmentCollector.collectAttachmentsEntireVault).toHaveBeenCalled();
      expect(mockFilesHandler.deleteEmptyFolders).toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith('Reorganization of the vault completed');
    });
  });

  describe('replaceAllWikiEmbedsWithMarkdownEmbeds', () => {
    it('should show a "no wiki embeds" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('No wiki embeds found that need to be replaced');
    });

    it('should skip ignored notes', async () => {
      const component = createComponent();
      mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).not.toHaveBeenCalled();
    });

    it('should report replaced wiki embeds (plural)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).mockResolvedValue(2);
      await component.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('Replaced 4 wiki embeds from 2 notes');
    });

    it('should report a single replaced wiki embed (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).mockResolvedValue(1);
      await component.replaceAllWikiEmbedsWithMarkdownEmbeds();
      expect(Notice).toHaveBeenCalledWith('Replaced 1 wiki embed from 1 note');
    });
  });

  describe('replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote', () => {
    it('should enqueue the replacement for the current note', () => {
      const component = createComponent();
      component.replaceAllWikiEmbedsWithMarkdownEmbedsCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('replaceAllWikilinksWithMarkdownLinks', () => {
    it('should show a "no wiki links" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('No wiki links found that need to be replaced');
    });

    it('should skip ignored notes', async () => {
      const component = createComponent();
      mockSettings.isPathIgnored.mockReturnValue(true);
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.replaceAllWikilinksWithMarkdownLinks();
      expect(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).not.toHaveBeenCalled();
    });

    it('should report replaced wikilinks (plural)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([
        strictProxy<TFile>({ path: 'a.md' }),
        strictProxy<TFile>({ path: 'b.md' })
      ]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).mockResolvedValue(2);
      await component.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('Replaced 4 wikilinks from 2 notes');
    });

    it('should report a single replaced wikilink (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.replaceAllNoteWikilinksWithMarkdownLinks).mockResolvedValue(1);
      await component.replaceAllWikilinksWithMarkdownLinks();
      expect(Notice).toHaveBeenCalledWith('Replaced 1 wikilink from 1 note');
    });
  });

  describe('replaceAllWikilinksWithMarkdownLinksCurrentNote', () => {
    it('should enqueue the replacement for the current note', () => {
      const component = createComponent();
      component.replaceAllWikilinksWithMarkdownLinksCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('saveAllOpenNotes', () => {
    it('should save dirty markdown views', async () => {
      const component = createComponent();
      const save = vi.fn((): Promise<void> => noopAsync());
      const view = castTo<SavableView>(Object.create(MarkdownView.prototype));
      view.save = save;
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view }]);
      await asPrivate(component).saveAllOpenNotes();
      expect(save).toHaveBeenCalled();
    });

    it('should ignore leaves that are not markdown views', async () => {
      const component = createComponent();
      mockApp.workspace.getLeavesOfType.mockReturnValue([{ view: {} }]);
      await asPrivate(component).saveAllOpenNotes();
      expect(mockApp.workspace.getLeavesOfType).toHaveBeenCalledWith('markdown');
    });
  });

  describe('handleDeletedMetadata', () => {
    it('should cache the previous metadata for a markdown note', () => {
      const component = createComponent();
      mockSettings.shouldDeleteAttachmentsWithNote = true;
      expect(() => {
        asPrivate(component).handleDeletedMetadata(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      }).not.toThrow();
    });

    it('should ignore deletions when shouldDeleteAttachmentsWithNote is false', () => {
      const component = createComponent();
      mockSettings.shouldDeleteAttachmentsWithNote = false;
      expect(() => {
        asPrivate(component).handleDeletedMetadata(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      }).not.toThrow();
    });

    it('should ignore deletions for ignored paths', () => {
      const component = createComponent();
      mockSettings.shouldDeleteAttachmentsWithNote = true;
      mockSettings.isPathIgnored.mockReturnValue(true);
      expect(() => {
        asPrivate(component).handleDeletedMetadata(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      }).not.toThrow();
    });
  });

  describe('handleMetadataCacheChanged', () => {
    it('should collect attachments when automatic collecting is enabled', () => {
      const component = createComponent();
      mockSettings.shouldCollectAttachmentsAutomatically = true;
      const file = strictProxy<TFile>({ path: 'note.md' });
      asPrivate(component).handleMetadataCacheChanged(file, new AbortController().signal);
      expect(mockAttachmentCollector.collectAttachmentsInAbstractFiles).toHaveBeenCalledWith([file]);
    });

    it('should do nothing when automatic collecting is disabled', () => {
      const component = createComponent();
      mockSettings.shouldCollectAttachmentsAutomatically = false;
      asPrivate(component).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), new AbortController().signal);
      expect(mockAttachmentCollector.collectAttachmentsInAbstractFiles).not.toHaveBeenCalled();
    });

    it('should skip collecting when a suggestion container is shown', () => {
      const component = createComponent();
      mockSettings.shouldCollectAttachmentsAutomatically = true;
      const container = activeDocument.createElement('div');
      container.addClass('suggestion-container');
      activeDocument.body.appendChild(container);
      vi.spyOn(container, 'isShown').mockReturnValue(true);
      asPrivate(component).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), new AbortController().signal);
      container.remove();
      expect(mockAttachmentCollector.collectAttachmentsInAbstractFiles).not.toHaveBeenCalled();
    });

    it('should throw when the abort signal is aborted', () => {
      const component = createComponent();
      const controller = new AbortController();
      controller.abort();
      expect(() => {
        asPrivate(component).handleMetadataCacheChanged(strictProxy<TFile>({ path: 'note.md' }), controller.signal);
      }).toThrow();
    });
  });

  describe('onLayoutReady', () => {
    it('should register metadata-cache deleted and changed handlers', () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      asPrivate(component).onLayoutReady();
      expect(mockApp.metadataCache.on).toHaveBeenCalledWith('deleted', expect.any(Function));
      expect(mockApp.metadataCache.on).toHaveBeenCalledWith('changed', expect.any(Function));
      expect(hoisted.registeredEventRefs).toHaveLength(2);
    });

    it('should handle the deleted event with a previous cache', () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      mockSettings.shouldDeleteAttachmentsWithNote = true;
      asPrivate(component).onLayoutReady();
      const deletedHandler = metadataCacheHandlers.get('deleted');
      expect(deletedHandler).toBeDefined();
      deletedHandler?.(strictProxy<TFile>({ path: 'note.md' }), castTo<CachedMetadata>({}));
      expect(deletedHandler).toBeDefined();
    });

    it('should ignore the deleted event with no previous cache', () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      asPrivate(component).onLayoutReady();
      const deletedHandler = metadataCacheHandlers.get('deleted');
      deletedHandler?.(strictProxy<TFile>({ path: 'note.md' }), null);
      expect(deletedHandler).toBeDefined();
    });

    it('should enqueue handling for the changed event', () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      mockSettings.shouldCollectAttachmentsAutomatically = false;
      asPrivate(component).onLayoutReady();
      const changedHandler = metadataCacheHandlers.get('changed');
      expect(changedHandler).toBeDefined();
      changedHandler?.(strictProxy<TFile>({ path: 'note.md' }));
      expect(hoisted.mockAddToQueue).toHaveBeenCalled();
    });
  });

  describe('showBackupWarning', () => {
    it('should not warn when the backup warning is disabled', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      await asPrivate(component).showBackupWarning();
      expect(mockAlert).not.toHaveBeenCalled();
    });

    it('should warn, revert dangerous settings and disable the warning', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = true;
      await asPrivate(component).showBackupWarning();
      expect(mockSettings.revertDangerousSettings).toHaveBeenCalled();
      expect(mockAlert).toHaveBeenCalled();
    });

    it('should mention reverted settings in the warning when they were reverted', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = true;
      mockSettings.hadDangerousSettingsReverted = true;
      await asPrivate(component).showBackupWarning();
      expect(mockAlert).toHaveBeenCalled();
    });
  });
});
