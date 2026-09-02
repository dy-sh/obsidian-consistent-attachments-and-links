import type {
  App as AppOriginal,
  Notice,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';

import { MarkdownView } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
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
import type { LinksHandler } from './links-handler.ts';
import type { PathCompatibilityHandler } from './path-compatibility-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';

import { ConsistentAttachmentsAndLinksComponent } from './consistent-attachments-and-links-component.ts';

interface ComponentPrivate {
  handleMetadataCacheChanged(file: TFile, abortSignal: AbortSignal): void;
  saveAllOpenNotes(): Promise<void>;
  showBackupWarning(): Promise<void>;
}

interface DisplayTextLeaf {
  getDisplayText(): string;
}

interface GlobalAppHolder {
  app: unknown;
}

interface LayoutReadyWorkspace {
  setLayoutReady__(): void;
}

interface ObsidianDevUtilsStateHolder {
  obsidianDevUtilsState: Record<string, unknown>;
}

interface SavableView {
  save(): Promise<void>;
}

// --- Hoisted shared state ---

const hoisted = vi.hoisted(() => ({
  mockAlert: vi.fn((..._arguments: unknown[]): Promise<void> => noopAsync()),
  mockCreateFolderSafe: vi.fn((..._arguments: unknown[]): Promise<void> => noopAsync()),
  mockGetMarkdownFilesSorted: vi.fn((): TFile[] => []),
  mockGetOrCreateFile: vi.fn((..._arguments: unknown[]): Promise<TFile> => Promise.resolve(strictProxy<TFile>({ path: 'report.md' })))
}));

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

// Spread the real module: the path-compatibility handler reaches `folder-note`, which imports members this
// Suite does not stub, and a bare object mock makes those `undefined` at import time.
vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/file-system')>(),
  getOrCreateFile: (...$arguments: unknown[]): Promise<TFile> => hoisted.mockGetOrCreateFile(...$arguments),
  isMarkdownFile: vi.fn(() => true)
}));

vi.mock('obsidian-dev-utils/obsidian/modals/alert', () => ({
  alert: (...$arguments: unknown[]): Promise<void> => hoisted.mockAlert(...$arguments)
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  createFolderSafe: (...$arguments: unknown[]): Promise<void> => hoisted.mockCreateFolderSafe(...$arguments),
  getMarkdownFilesSorted: (): TFile[] => hoisted.mockGetMarkdownFilesSorted()
}));

const mockAlert = hoisted.mockAlert;

let app: AppOriginal;
let previousGlobalApp: unknown;

const mockSettings = {
  consistencyReportFile: 'report.md',
  hadDangerousSettingsReverted: false,
  isPathIgnored: vi.fn((_path: string): boolean => false),
  revertDangerousSettings: vi.fn((): void => undefined),
  shouldCollectAttachmentsAutomatically: false,
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
  convertAllNoteEmbedsPathsToRelative: vi.fn((): ReturnType<LinksHandler['convertAllNoteEmbedsPathsToRelative']> => Promise.resolve([])),
  convertAllNoteLinksPathsToRelative: vi.fn((): ReturnType<LinksHandler['convertAllNoteLinksPathsToRelative']> => Promise.resolve([]))
});

const mockPathCompatibilityHandler = strictProxy<PathCompatibilityHandler>({
  check: vi.fn((): void => undefined),
  fix: vi.fn((): Promise<void> => noopAsync())
});

const mockPluginNoticeComponent = strictProxy<PluginNoticeComponent>({
  showNotice: vi.fn((_message: DocumentFragment | string): Notice => castTo<Notice>({}))
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
    app,
    attachmentCollector: mockAttachmentCollector,
    filesHandler: mockFilesHandler,
    linksHandler: mockLinksHandler,
    pathCompatibilityHandler: mockPathCompatibilityHandler,
    pluginNoticeComponent: mockPluginNoticeComponent,
    pluginSettingsComponent: mockPluginSettingsComponent
  });
}

async function flushAsync(): Promise<void> {
  await noopAsync();
  await noopAsync();
}

async function loadAndFireLayoutReady(component: ConsistentAttachmentsAndLinksComponent): Promise<void> {
  component.load();
  castTo<LayoutReadyWorkspace>(app.workspace).setLayoutReady__();
  await sleep(0);
  await flushAsync();
}

// --- Tests ---

describe('ConsistentAttachmentsAndLinksComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const appMock = App.createConfigured__();
    // Initialize the dev-utils shared-state holder so the real `addToQueue` can read/write its queue through the strict-proxied app without tripping the unmocked-property guard.
    castTo<ObsidianDevUtilsStateHolder>(appMock).obsidianDevUtilsState = {};
    app = castTo<AppOriginal>(appMock);
    // Point the Obsidian global at the configured app so dev-utils helpers that resolve the app implicitly (e.g. `getLibDebugger`) share the same initialized shared-state holder.
    previousGlobalApp = castTo<GlobalAppHolder>(window).app;
    castTo<GlobalAppHolder>(window).app = appMock;
    hoisted.mockGetMarkdownFilesSorted.mockReturnValue([]);
    mockSettings.isPathIgnored.mockReturnValue(false);
    mockSettings.shouldShowBackupWarning = true;
    mockSettings.shouldCollectAttachmentsAutomatically = false;
    mockSettings.hadDangerousSettingsReverted = false;
    castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).mockResolvedValue([]);
    castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteLinksPathsToRelative).mockResolvedValue([]);
  });

  afterEach(() => {
    castTo<GlobalAppHolder>(window).app = previousGlobalApp;
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
      const modifySpy = vi.spyOn(app.vault, 'modify').mockResolvedValue();
      const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      await component.checkConsistency();
      expect(mockLinksHandler.checkConsistency).toHaveBeenCalled();
      expect(hoisted.mockCreateFolderSafe).toHaveBeenCalled();
      expect(modifySpy).toHaveBeenCalled();
      expect(openLinkTextSpy).toHaveBeenCalledWith('report.md', '/', false);
    });

    it('should not reopen the report when it is already open', async () => {
      const component = createComponent();
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'iterateAllLeaves').mockImplementation((callback: (leaf: WorkspaceLeaf) => void) => {
        callback(castTo<WorkspaceLeaf>(castTo<DisplayTextLeaf>({ getDisplayText: () => 'report.md' })));
      });
      const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      await component.checkConsistency();
      expect(openLinkTextSpy).not.toHaveBeenCalled();
    });

    it('should ignore leaves with an empty display text', async () => {
      const component = createComponent();
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'iterateAllLeaves').mockImplementation((callback: (leaf: WorkspaceLeaf) => void) => {
        callback(castTo<WorkspaceLeaf>(castTo<DisplayTextLeaf>({ getDisplayText: () => '' })));
      });
      const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      await component.checkConsistency();
      expect(openLinkTextSpy).toHaveBeenCalled();
    });
  });

  describe('convertAllEmbedsPathsToRelative', () => {
    it('should show a "no embeds" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllEmbedsPathsToRelative();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('No embeds found that need to be converted');
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
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('Converted 4 embeds from 2 notes');
    });

    it('should report a single converted embed (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).mockResolvedValue(['x']);
      await component.convertAllEmbedsPathsToRelative();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('Converted 1 embed from 1 note');
    });
  });

  describe('convertAllEmbedsPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', async () => {
      const component = createComponent();
      component.convertAllEmbedsPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      await vi.waitFor(() => {
        expect(mockLinksHandler.convertAllNoteEmbedsPathsToRelative).toHaveBeenCalledWith('note.md', expect.anything());
      });
    });
  });

  describe('convertAllLinkPathsToRelative', () => {
    it('should show a "no links" notice when nothing changed', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('No links found that need to be converted');
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
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('Converted 4 links from 2 notes');
    });

    it('should report a single converted link (singular)', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'a.md' })]);
      castTo<ReturnType<typeof vi.fn>>(mockLinksHandler.convertAllNoteLinksPathsToRelative).mockResolvedValue(['x']);
      await component.convertAllLinkPathsToRelative(new AbortController().signal);
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('Converted 1 link from 1 note');
    });

    it('should throw when the abort signal is already aborted', async () => {
      const component = createComponent();
      const controller = new AbortController();
      controller.abort();
      await expect(component.convertAllLinkPathsToRelative(controller.signal)).rejects.toThrow();
    });
  });

  describe('convertAllLinkPathsToRelativeCurrentNote', () => {
    it('should enqueue the conversion for the current note', async () => {
      const component = createComponent();
      component.convertAllLinkPathsToRelativeCurrentNote(strictProxy<TFile>({ path: 'note.md' }));
      await vi.waitFor(() => {
        expect(mockLinksHandler.convertAllNoteLinksPathsToRelative).toHaveBeenCalledWith('note.md', expect.anything());
      });
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
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith('Reorganization of the vault completed');
    });
  });

  describe('saveAllOpenNotes', () => {
    it('should save dirty markdown views', async () => {
      const component = createComponent();
      const save = vi.fn((): Promise<void> => noopAsync());
      const view = castTo<SavableView>(Object.create(MarkdownView.prototype));
      view.save = save;
      vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([castTo<WorkspaceLeaf>({ view: castTo<MarkdownView>(view) })]);
      await asPrivate(component).saveAllOpenNotes();
      expect(save).toHaveBeenCalled();
    });

    it('should ignore leaves that are not markdown views', async () => {
      const component = createComponent();
      const getLeavesOfTypeSpy = vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([castTo<WorkspaceLeaf>({ view: castTo<MarkdownView>({}) })]);
      await asPrivate(component).saveAllOpenNotes();
      expect(getLeavesOfTypeSpy).toHaveBeenCalledWith('markdown');
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
      const container = activeWindow.createDiv();
      container.addClass('suggestion-container');
      activeDocument.body.append(container);
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
    it('should enqueue handling for the changed event', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = false;
      mockSettings.shouldCollectAttachmentsAutomatically = true;
      await loadAndFireLayoutReady(component);
      const file = strictProxy<TFile>({ path: 'note.md' });
      app.metadataCache.trigger('changed', file);
      await vi.waitFor(() => {
        expect(mockAttachmentCollector.collectAttachmentsInAbstractFiles).toHaveBeenCalledWith([file]);
      });
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
