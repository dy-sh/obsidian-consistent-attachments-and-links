import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponentDelayedNotice } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App as AppOriginal,
  Notice,
  TFile,
  WorkspaceLeaf
} from 'obsidian';

import {
  CaseInsensitiveFileIndex,
  getCaseInsensitiveFileIndex,
  setCaseInsensitiveFileIndex,
  unsetCaseInsensitiveFileIndex
} from '@mnaoumov/obsidian-lib/case-insensitive-file-index';
import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import { initI18N } from '@mnaoumov/obsidian-lib/i18n/i18n';
import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { MarkdownView } from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { HtmlProblemHandler } from '../html-problems/html-problem-handler.ts';
import type { MisplacedAttachmentHandler } from '../misplaced-attachments/misplaced-attachment-handler.ts';
import type { PathCompatibilityHandler } from '../path-compatibility/path-compatibility-handler.ts';
import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { LinksHandler } from './links-handler.ts';

import { translationsMap } from '../i18n/locales/translations-map.ts';
import { MisplacedAttachmentCheckResult } from '../misplaced-attachments/misplaced-attachment-handler.ts';
import { ConsistentAttachmentsAndLinksComponent } from './consistent-attachments-and-links-component.ts';

interface BackupWarningAlertParams {
  readonly message: DocumentFragment;
  readonly title: DocumentFragment;
}

interface ComponentPrivate {
  readonly saveAllOpenNotes: () => Promise<void>;
  readonly showBackupWarning: () => Promise<void>;
}

interface DisplayTextLeaf {
  readonly getDisplayText: () => string;
  readonly view: ViewTypeView;
}

interface GlobalAppHolder {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace the app binding during setup and restore it during teardown.
  app: unknown;
}

interface LayoutReadyWorkspace {
  readonly setLayoutReady__: () => void;
}

interface ModeHolder {
  readonly mode: unknown;
}

interface SavableView {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- This test installs a save spy on a MarkdownView prototype fixture.
  save: () => Promise<void>;
}

interface ViewTypeView {
  readonly getViewType: () => string;
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

vi.mock('../misplaced-attachments/misplaced-attachment-handler.ts', () => ({
  MisplacedAttachmentCheckResult: class {
    public constructor(public readonly mode?: unknown) {}

    public toString(): string {
      return 'Misplaced attachments\n';
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Placeholder class so the value import resolves; the real instance is injected.
  MisplacedAttachmentHandler: class {}
}));

// Spread the real module: the path-compatibility handler reaches `folder-note`, which imports members this
// suite does not stub, and a bare object mock makes those `undefined` at import time.
vi.mock('@mnaoumov/obsidian-lib/file-system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mnaoumov/obsidian-lib/file-system')>()),
  getOrCreateFile: (...$arguments: unknown[]): Promise<TFile> => hoisted.mockGetOrCreateFile(...$arguments),
  isMarkdownFile: vi.fn(() => true)
}));

vi.mock('@mnaoumov/obsidian-lib/modals/alert', () => ({
  alert: (...$arguments: unknown[]): Promise<void> => hoisted.mockAlert(...$arguments)
}));

vi.mock('@mnaoumov/obsidian-lib/vault', () => ({
  createFolderSafe: (...$arguments: unknown[]): Promise<void> => hoisted.mockCreateFolderSafe(...$arguments),
  getMarkdownFilesSorted: (): TFile[] => hoisted.mockGetMarkdownFilesSorted()
}));

const mockAlert = hoisted.mockAlert;

let app: AppOriginal;
let previousGlobalApp: unknown;

const mockSettings = {
  consistencyReportFile: 'report.md',
  externalAttachmentLinkMode: 'ReportUnowned',
  isConsistencyReportPath: (path: string): boolean => path === 'report.md',
  isPathIgnored: vi.fn((_path: string): boolean => false),
  shouldShowBackupWarning: true
};

const mockAbortSignalComponent = strictProxy<AbortSignalComponent>({
  abortSignal: new AbortController().signal
});

const mockHtmlProblems = {
  toString: (): string => 'HTML problems\n'
};

const mockHtmlProblemHandler = strictProxy<HtmlProblemHandler>({
  check: vi.fn((): Promise<void> => noopAsync()),
  createResult: vi.fn(() => castTo<ReturnType<HtmlProblemHandler['createResult']>>(mockHtmlProblems))
});

const mockLinksHandler = strictProxy<LinksHandler>({
  checkConsistency: vi.fn((): Promise<void> => noopAsync())
});

const mockMisplacedAttachmentHandler = strictProxy<MisplacedAttachmentHandler>({
  check: vi.fn((): Promise<void> => noopAsync())
});

const mockPathCompatibilityHandler = strictProxy<PathCompatibilityHandler>({
  check: vi.fn((): void => undefined),
  fix: vi.fn((): Promise<void> => noopAsync())
});

const mockPluginNoticeComponent = strictProxy<PluginNoticeComponent>({
  showNotice: vi.fn((_message: DocumentFragment | string): Notice => castTo<Notice>({})),
  // `checkConsistency`'s `loop` asks for its progress notice through this.
  showNoticeAfterDelay: vi.fn((): PluginNoticeComponentDelayedNotice => ({
    dispose: noop,
    setContent: noop,
    [Symbol.dispose]: noop
  }))
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
    htmlProblemHandler: mockHtmlProblemHandler,
    linksHandler: mockLinksHandler,
    misplacedAttachmentHandler: mockMisplacedAttachmentHandler,
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
    app = castTo<AppOriginal>(appMock);
    // Point the Obsidian global at the configured app so obsidian-lib helpers that resolve the app implicitly reach it.
    previousGlobalApp = castTo<GlobalAppHolder>(window).app;
    castTo<GlobalAppHolder>(window).app = appMock;
    hoisted.mockGetMarkdownFilesSorted.mockReturnValue([]);
    mockSettings.isPathIgnored.mockReturnValue(false);
    mockSettings.shouldShowBackupWarning = true;
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

    it('should check every note for HTML problems and write that section after the link sections', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      const modifySpy = vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();

      await component.checkConsistency();

      expect(mockHtmlProblemHandler.createResult).toHaveBeenCalledTimes(1);
      expect(mockHtmlProblemHandler.check).toHaveBeenCalledWith({ htmlProblems: mockHtmlProblems, notePath: 'note.md' });
      const text = modifySpy.mock.calls[0]?.[1] ?? '';
      expect(text.indexOf('HTML problems\n')).toBeGreaterThan(text.indexOf('Bad frontmatter links\n'));
      // Misplaced attachments stays last: integration suites slice the report from its heading to the end.
      expect(text.indexOf('HTML problems\n')).toBeLessThan(text.indexOf('Misplaced attachments\n'));
    });

    it('should write all six sections, with the misplaced attachments one last', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      const modifySpy = vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();

      await component.checkConsistency();

      const text = modifySpy.mock.calls[0]?.[1] ?? '';
      expect(text).toContain('Bad links\n');
      expect(text).toContain('Bad embeds\n');
      expect(text).toContain('Bad frontmatter links\n');
      expect(text).toContain('Misplaced attachments\n');
      expect(text.indexOf('Misplaced attachments\n')).toBeGreaterThan(text.indexOf('Bad frontmatter links\n'));
    });

    it('should neither point to Vault Problems nor show its notice while that plugin is not enabled', async () => {
      await initI18N(translationsMap);
      const component = createComponent();
      const modifySpy = vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();

      await component.checkConsistency();

      const text = modifySpy.mock.calls[0]?.[1] ?? '';
      expect(text.startsWith('Bad links\n')).toBe(true);
      expect(text).not.toContain('Vault Problems');
      expect(mockPluginNoticeComponent.showNotice).not.toHaveBeenCalled();
    });

    it('should still write the report, opened by a pointer to Vault Problems, and offer its view in a notice', async () => {
      await initI18N(translationsMap);
      app.plugins.enabledPlugins.add('vault-problems');
      const component = createComponent();
      const modifySpy = vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      const executedCommandIds: string[] = [];
      app.commands = strictProxy<AppOriginal['commands']>({
        executeCommandById: (commandId: string): boolean => {
          executedCommandIds.push(commandId);
          return true;
        }
      });

      await component.checkConsistency();

      const text = modifySpy.mock.calls[0]?.[1] ?? '';
      expect(text.startsWith('> [!TIP]\n> `Vault Problems` shows these problems live')).toBe(true);
      expect(text).toContain('Bad links\n');
      expect(text).toContain('Misplaced attachments\n');

      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledTimes(1);
      const message = castTo<DocumentFragment>(vi.mocked(mockPluginNoticeComponent.showNotice).mock.calls[0]?.[0]);
      expect(message.querySelector('code')?.textContent).toBe('Vault Problems');
      const button = ensureNonNullable(message.querySelector('button'));
      expect(button.textContent).toBe('Open Problems');
      expect(executedCommandIds).toStrictEqual([]);
      button.click();
      expect(executedCommandIds).toStrictEqual(['vault-problems:open-problems']);
    });

    it('should hand the misplaced-attachment handler and its bucket to the links handler', async () => {
      const component = createComponent();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();

      await component.checkConsistency();

      const [checkParams] = vi.mocked(mockLinksHandler.checkConsistency).mock.calls[0] ?? [];
      expect(checkParams?.misplacedAttachmentHandler).toBe(mockMisplacedAttachmentHandler);
      expect(checkParams?.misplacedAttachments).toBeInstanceOf(MisplacedAttachmentCheckResult);
      // The bucket applies the configured mode once the walk is over, so it must be built with it.
      expect(castTo<ModeHolder>(checkParams?.misplacedAttachments).mode).toBe('ReportUnowned');
    });

    // The report links every attachment it reports: judging it would report its own lines on the next run, each at
    // the full price of an attachment-path question.
    it('should never judge the report note itself', async () => {
      const component = createComponent();
      const note = strictProxy<TFile>({ path: 'note.md' });
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([note, strictProxy<TFile>({ path: 'report.md' })]);
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();

      await component.checkConsistency();

      const judgedNotes = vi.mocked(mockLinksHandler.checkConsistency).mock.calls.map(([params]) => params.note);
      expect(judgedNotes).toStrictEqual([note]);
    });

    it('should install the case-insensitive file index for the walk only', async () => {
      const component = createComponent();
      component.load();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      let indexDuringWalk: CaseInsensitiveFileIndex | null = null;
      vi.mocked(mockLinksHandler.checkConsistency).mockImplementationOnce(() => {
        indexDuringWalk = getCaseInsensitiveFileIndex(app);
        return noopAsync();
      });

      await component.checkConsistency();

      expect(indexDuringWalk).not.toBeNull();
      expect(getCaseInsensitiveFileIndex(app)).toBeNull();
      component.unload();
    });

    it('should leave an index another plugin installed in place', async () => {
      const component = createComponent();
      component.load();
      hoisted.mockGetMarkdownFilesSorted.mockReturnValue([strictProxy<TFile>({ path: 'note.md' })]);
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      const otherIndex = new CaseInsensitiveFileIndex(app);
      setCaseInsensitiveFileIndex(otherIndex);
      let indexDuringWalk: CaseInsensitiveFileIndex | null = null;
      vi.mocked(mockLinksHandler.checkConsistency).mockImplementationOnce(() => {
        indexDuringWalk = getCaseInsensitiveFileIndex(app);
        return noopAsync();
      });

      try {
        await component.checkConsistency();

        expect(indexDuringWalk).toBe(otherIndex);
        expect(getCaseInsensitiveFileIndex(app)).toBe(otherIndex);
      } finally {
        unsetCaseInsensitiveFileIndex(otherIndex);
        component.unload();
      }
    });

    it('should not reopen the report when it is already open', async () => {
      const component = createComponent();
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'iterateAllLeaves').mockImplementation((callback: (leaf: WorkspaceLeaf) => void) => {
        callback(castTo<WorkspaceLeaf>(castTo<DisplayTextLeaf>({ getDisplayText: () => 'report.md', view: { getViewType: () => 'empty' } })));
      });
      const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      await component.checkConsistency();
      expect(openLinkTextSpy).not.toHaveBeenCalled();
    });

    it('should ignore leaves with an empty display text', async () => {
      const component = createComponent();
      vi.spyOn(app.vault, 'modify').mockResolvedValue();
      vi.spyOn(app.workspace, 'iterateAllLeaves').mockImplementation((callback: (leaf: WorkspaceLeaf) => void) => {
        callback(castTo<WorkspaceLeaf>(castTo<DisplayTextLeaf>({ getDisplayText: () => '', view: { getViewType: () => 'empty' } })));
      });
      const openLinkTextSpy = vi.spyOn(app.workspace, 'openLinkText').mockResolvedValue();
      await component.checkConsistency();
      expect(openLinkTextSpy).toHaveBeenCalled();
    });
  });

  describe('fixIncompatiblePaths', () => {
    it('should run the path compatibility repair', async () => {
      const component = createComponent();
      await component.fixIncompatiblePaths();
      expect(mockPathCompatibilityHandler.fix).toHaveBeenCalled();
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

  describe('onLayoutReady', () => {
    it('should show the backup warning', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = true;
      await loadAndFireLayoutReady(component);
      await vi.waitFor(() => {
        expect(mockAlert).toHaveBeenCalled();
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

    it('should warn once and then disable the warning', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = true;
      await asPrivate(component).showBackupWarning();
      expect(mockAlert).toHaveBeenCalled();
      expect(mockSettings.shouldShowBackupWarning).toBe(false);
    });

    it('should render the plugin name as code in the message and the title', async () => {
      const component = createComponent();
      mockSettings.shouldShowBackupWarning = true;
      await asPrivate(component).showBackupWarning();
      const [params] = mockAlert.mock.calls[0] ?? [];
      const { message, title } = params as BackupWarningAlertParams;
      expect(message.querySelector('code')?.textContent).toBe('Consistent Attachments and Links');
      expect(title.querySelector('code')?.textContent).toBe('Consistent Attachments and Links');
    });
  });
});
