import type {
  App as AppOriginal,
  DataAdapter,
  Notice,
  TAbstractFile,
  TFile as TFileOriginal
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { LoopParams } from 'obsidian-dev-utils/obsidian/loop';
import type { ResourceLockComponent } from 'obsidian-dev-utils/obsidian/resource-lock';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import {
  addAlias,
  processFrontmatter
} from 'obsidian-dev-utils/obsidian/file-manager';
import {
  getFileOrNull,
  getOrCreateFile
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  FolderNoteLocation,
  resolveFolderNote,
  resolveFolderNoteConfig
} from 'obsidian-dev-utils/obsidian/folder-note';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { generateMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import {
  getSafeRenamePath,
  renameSafe
} from 'obsidian-dev-utils/obsidian/vault';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  TFile,
  TFolder,
  Vault
} from 'obsidian-test-mocks/obsidian';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';

import { translationsMap } from './i18n/locales/translations-map.ts';
import {
  PathCompatibilityCheckResult,
  PathCompatibilityHandler
} from './path-compatibility-handler.ts';
import { PathCompatibilityPlatform } from './path-compatibility.ts';

const hoisted = vi.hoisted(() => ({
  basePath: 'C:/vault'
}));

interface DataAdapterExLike {
  basePath: string;
}

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getDataAdapterEx: (): DataAdapterExLike => ({ basePath: hoisted.basePath })
}));

vi.mock('obsidian-dev-utils/obsidian/file-manager', () => ({
  addAlias: vi.fn(() => noopAsync()),
  processFrontmatter: vi.fn(() => noopAsync())
}));

// Spread the real module: `isFolder` / `isMarkdownFile` / `asFile` do the type routing this handler is built
// On, and a stub of them would be testing the stub (G49).
vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/file-system')>(),
  getFileOrNull: vi.fn(),
  getOrCreateFile: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/folder-note', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/folder-note')>(),
  resolveFolderNote: vi.fn(),
  resolveFolderNoteConfig: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  generateMarkdownLink: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  getSafeRenamePath: vi.fn(),
  renameSafe: vi.fn()
}));

const mockAddAlias = vi.mocked(addAlias);
const mockProcessFrontmatter = vi.mocked(processFrontmatter);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockGetOrCreateFile = vi.mocked(getOrCreateFile);
const mockGenerateMarkdownLink = vi.mocked(generateMarkdownLink);
const mockGetSafeRenamePath = vi.mocked(getSafeRenamePath);
const mockLoop = vi.mocked(loop);
const mockRenameSafe = vi.mocked(renameSafe);
const mockResolveFolderNote = vi.mocked(resolveFolderNote);
const mockResolveFolderNoteConfig = vi.mocked(resolveFolderNoteConfig);

// The fixtures only ever carry the vault, never call through it, so a strict proxy makes any real use throw
// Rather than quietly succeed.
const vault = Vault.create2__(strictProxy<DataAdapter>({}));
const loadedFiles: TAbstractFile[] = [];

const mockSettings = {
  getPathCompatibilityPlatforms: vi.fn((): PathCompatibilityPlatform[] => [PathCompatibilityPlatform.Windows]),
  isPathIgnored: vi.fn((_path: string): boolean => false),
  maxVaultRootPathLength: 0,
  shouldCreateNoteToPreserveOriginalName: false,
  sidecarNoteNamePattern: '{{fileName}}.md'
};

const mockPluginNoticeComponent = strictProxy<PluginNoticeComponent>({
  showNotice: vi.fn((_message: DocumentFragment | string): Notice => castTo<Notice>({}))
});

const app = strictProxy<AppOriginal>({
  vault: strictProxy<AppOriginal['vault']>({
    getAllLoadedFiles: (): TAbstractFile[] => loadedFiles
  })
});

function createFile(path: string, parent: null | TFolder = null): TFileOriginal {
  const file = TFile.create__(vault, path);
  file.parent = parent;
  return castTo<TFileOriginal>(file);
}

function createFolder(path: string, parent: null | TFolder = null): TFolder {
  const folder = TFolder.create__(vault, path);
  folder.parent = parent;
  return folder;
}

function createHandler(): PathCompatibilityHandler {
  return new PathCompatibilityHandler({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: new AbortController().signal }),
    app,
    pluginNoticeComponent: mockPluginNoticeComponent,
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({ settings: castTo<PluginSettings>(mockSettings) }),
    resourceLockComponent: castTo<null | ResourceLockComponent>(null)
  });
}

/**
 * Runs the mocked `loop` the way the real one does — sequentially over its items — so the pass under test
 * actually executes.
 */
function runLoop(): void {
  mockLoop.mockImplementation(async (params: LoopParams<unknown>) => {
    for (const item of params.items) {
      await params.processItem(item);
    }
  });
}

function setVault(...files: unknown[]): void {
  loadedFiles.length = 0;
  loadedFiles.push(...castTo<TAbstractFile[]>(files));
}

// A path over Windows' 259 with the `C:/vault` root, and one comfortably under it.
const LONG_BASENAME = 'a'.repeat(300);

describe('PathCompatibilityHandler', () => {
  beforeAll(async () => {
    await initI18N(translationsMap);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.basePath = 'C:/vault';
    mockSettings.getPathCompatibilityPlatforms.mockReturnValue([PathCompatibilityPlatform.Windows]);
    mockSettings.isPathIgnored.mockReturnValue(false);
    mockSettings.maxVaultRootPathLength = 0;
    mockSettings.shouldCreateNoteToPreserveOriginalName = false;
    mockSettings.sidecarNoteNamePattern = '{{fileName}}.md';
    mockGetFileOrNull.mockReturnValue(null);
    mockGetSafeRenamePath.mockImplementation((params) => params.newPath);
    // Mimic the real rename: it mutates the abstract file, which is what the sidecar and preservation steps
    // Read afterwards.
    mockRenameSafe.mockImplementation(async (params) => {
      const abstractFile = castTo<TAbstractFile>(params.oldPathOrAbstractFile);
      abstractFile.path = params.newPath;
      abstractFile.name = params.newPath.split('/').pop() ?? params.newPath;

      if (abstractFile instanceof TFile) {
        const dotIndex = abstractFile.name.lastIndexOf('.');
        abstractFile.extension = dotIndex === -1 ? '' : abstractFile.name.slice(dotIndex + 1);
        abstractFile.basename = dotIndex === -1 ? abstractFile.name : abstractFile.name.slice(0, dotIndex);
      }

      await noopAsync();
      return params.newPath;
    });
    runLoop();
  });

  describe('check', () => {
    it('should report nothing when no platform is enabled', () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([]);
      setVault(createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(0);
      expect(result.vaultRootWarning).toBeNull();
    });

    it('should report an offending file with the name the repair would produce', () => {
      setVault(createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.path).toBe(`${LONG_BASENAME}.md`);
      expect(result.entries[0]?.newPath).not.toBeNull();
      expect(result.entries[0]?.newPath?.length).toBeLessThan(`${LONG_BASENAME}.md`.length);
    });

    it('should report an unrepairable item with no new path', () => {
      mockSettings.maxVaultRootPathLength = 258;
      setVault(createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.newPath).toBeNull();
    });

    it('should skip an ignored path', () => {
      mockSettings.isPathIgnored.mockReturnValue(true);
      setVault(createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(0);
    });

    it('should skip the vault root folder', () => {
      setVault(createFolder('/'), createFile('ordinary.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(0);
    });

    it('should warn when the real vault root is longer than the configured maximum', () => {
      mockSettings.maxVaultRootPathLength = 3;
      setVault(createFile('ordinary.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.vaultRootWarning).toContain('8');
    });

    it('should not warn when the configured maximum is the automatic one', () => {
      setVault(createFile('ordinary.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.vaultRootWarning).toBeNull();
    });

    it('should measure a path against the configured maximum rather than the real root', () => {
      mockSettings.maxVaultRootPathLength = 250;
      setVault(createFile('ordinary.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(1);
    });
  });

  describe('fix', () => {
    it('should do nothing and say so when no platform is enabled', async () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([]);
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('No platforms are selected'));
    });

    it('should rename an offending file and report the count', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Repaired 1'));
    });

    it('should leave a valid file alone', async () => {
      setVault(createFile('ordinary.md'));

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('No paths found'));
    });

    it('should list what it could not repair', async () => {
      mockSettings.maxVaultRootPathLength = 258;
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Could not repair 1'));
    });

    it('should warn about the vault root before repairing', async () => {
      mockSettings.maxVaultRootPathLength = 3;
      setVault(createFile('ordinary.md'));

      await createHandler().fix();

      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('vault root path'));
    });

    it('should rename inside the offending item\'s own folder', async () => {
      const folder = createFolder('notes');
      setVault(createFile(`notes/${LONG_BASENAME}.md`, folder));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledWith(expect.objectContaining({ newPath: expect.stringMatching(/^notes\//) as unknown }));
    });

    it('should build the progress message from the item being processed', async () => {
      setVault(createFile('ordinary.md'));

      await createHandler().fix();

      const params = mockLoop.mock.calls[0]?.[0] as LoopParams<TAbstractFile>;
      expect(params.buildNoticeMessage({ item: castTo<TAbstractFile>({ path: 'x.md' }), iterationString: '1 / 1' })).toContain('x.md');
    });

    // `renameSafe` resolves a collision by lengthening the name, which can undo the repair.
    it('should shrink the name further when collision resolution pushes it back over the limit', async () => {
      mockGetSafeRenamePath.mockImplementation((params) => `${params.newPath} 1${'x'.repeat(300)}`);
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Could not repair 1'));
    });

    it('should shrink an extension-less name through the same retries', async () => {
      mockGetSafeRenamePath.mockImplementation((params) => `${params.newPath} 1${'x'.repeat(300)}`);
      setVault(createFile(LONG_BASENAME));

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Could not repair 1'));
    });

    it('should accept a collision-resolved name that still fits', async () => {
      mockGetSafeRenamePath.mockImplementation((params) => params.newPath.replace('.md', ' 1.md'));
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('preserving the original name', () => {
    it('should write the alias and the title into a renamed markdown note itself', async () => {
      const file = createFile(`${LONG_BASENAME}.md`);
      setVault(file);

      await createHandler().fix();

      expect(mockAddAlias).toHaveBeenCalledWith(expect.objectContaining({ alias: `${LONG_BASENAME}.md` }));
      expect(mockProcessFrontmatter).toHaveBeenCalledTimes(1);

      const frontmatter: Record<string, unknown> = {};
      await mockProcessFrontmatter.mock.calls[0]?.[0].frontmatterFunction(frontmatter, new AbortController().signal);
      expect(frontmatter['title']).toBe(`${LONG_BASENAME}.md`);
    });

    it('should write into a folder\'s folder note', async () => {
      const folderNote = createFile('notes/notes.md');
      mockResolveFolderNote.mockReturnValue(castTo<TFileOriginal>(folderNote));
      setVault(createFolder(LONG_BASENAME));

      await createHandler().fix();

      expect(mockAddAlias).toHaveBeenCalledWith(expect.objectContaining({ alias: LONG_BASENAME, pathOrFile: folderNote }));
    });

    it('should leave a folder with no folder note alone by default', async () => {
      mockResolveFolderNote.mockReturnValue(null);
      setVault(createFolder(LONG_BASENAME));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
      expect(mockAddAlias).not.toHaveBeenCalled();
      expect(mockGetOrCreateFile).not.toHaveBeenCalled();
    });

    it('should create a folder note inside the folder when asked to', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockResolveFolderNote.mockReturnValue(null);
      mockResolveFolderNoteConfig.mockReturnValue({
        extensions: ['md'],
        isHidden: false,
        location: FolderNoteLocation.InsideFolder,
        resolveName: (folder) => folder.name
      });
      mockGetOrCreateFile.mockResolvedValue(castTo<TFileOriginal>(createFile('x/x.md')));
      setVault(createFolder(LONG_BASENAME));

      await createHandler().fix();

      expect(mockGetOrCreateFile).toHaveBeenCalledWith(app, expect.stringContaining('/'));
      expect(mockAddAlias).toHaveBeenCalled();
    });

    it('should create a folder note beside the folder when that is the convention', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockResolveFolderNote.mockReturnValue(null);
      mockResolveFolderNoteConfig.mockReturnValue({
        extensions: ['md'],
        isHidden: false,
        location: FolderNoteLocation.ParentFolder,
        resolveName: (folder) => folder.name
      });
      mockGetOrCreateFile.mockResolvedValue(castTo<TFileOriginal>(createFile('x.md')));
      const parent = createFolder('notes');
      setVault(createFolder(`notes/${LONG_BASENAME}`, parent));

      await createHandler().fix();

      expect(mockGetOrCreateFile).toHaveBeenCalledWith(app, expect.stringMatching(/^notes\/[^/]+\.md$/));
    });

    it('should create nothing when the vault has no folder-note convention', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockResolveFolderNote.mockReturnValue(null);
      mockResolveFolderNoteConfig.mockReturnValue({
        extensions: ['md'],
        isHidden: false,
        location: FolderNoteLocation.None,
        resolveName: (folder) => folder.name
      });
      setVault(createFolder(LONG_BASENAME));

      await createHandler().fix();

      expect(mockGetOrCreateFile).not.toHaveBeenCalled();
    });

    it('should create nothing when the folder-note convention names nothing', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockResolveFolderNote.mockReturnValue(null);
      mockResolveFolderNoteConfig.mockReturnValue({
        extensions: [],
        isHidden: false,
        location: FolderNoteLocation.InsideFolder,
        resolveName: () => '  '
      });
      setVault(createFolder(LONG_BASENAME));

      await createHandler().fix();

      expect(mockGetOrCreateFile).not.toHaveBeenCalled();
    });

    it('should write into an attachment\'s existing sidecar note', async () => {
      const sidecar = createFile(`${LONG_BASENAME}.png.md`);
      // Track the sidecar's CURRENT path: the handler resolves it once before the rename and again after,
      // And the mocked rename moves it in between.
      mockGetFileOrNull.mockImplementation((params) => (params.pathOrFile === sidecar.path ? castTo<TFileOriginal>(sidecar) : null));
      setVault(createFile(`${LONG_BASENAME}.png`));

      await createHandler().fix();

      expect(mockAddAlias).toHaveBeenCalledWith(expect.objectContaining({ alias: `${LONG_BASENAME}.png` }));
    });

    it('should leave an attachment with no sidecar alone by default', async () => {
      setVault(createFile(`${LONG_BASENAME}.png`));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
      expect(mockAddAlias).not.toHaveBeenCalled();
    });

    it('should create a sidecar note when asked to', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockGetOrCreateFile.mockResolvedValue(castTo<TFileOriginal>(createFile('x.png.md')));
      setVault(createFile(`${LONG_BASENAME}.png`));

      await createHandler().fix();

      expect(mockGetOrCreateFile).toHaveBeenCalledWith(app, expect.stringMatching(/\.png\.md$/));
    });

    it('should honour the sidecar name pattern tokens', async () => {
      mockSettings.shouldCreateNoteToPreserveOriginalName = true;
      mockSettings.sidecarNoteNamePattern = '{{basename}}-{{extension}}.md';
      mockGetOrCreateFile.mockResolvedValue(castTo<TFileOriginal>(createFile('x.md')));
      setVault(createFile(`${LONG_BASENAME}.png`));

      await createHandler().fix();

      expect(mockGetOrCreateFile).toHaveBeenCalledWith(app, expect.stringMatching(/-png\.md$/));
    });

    // The rename is ours, so the sidecar it orphans is ours to move.
    it('should rename an attachment\'s sidecar so it keeps matching the pattern', async () => {
      const sidecar = createFile(`${LONG_BASENAME}.png.md`);
      // Track the sidecar's CURRENT path: the handler resolves it once before the rename and again after,
      // And the mocked rename moves it in between.
      mockGetFileOrNull.mockImplementation((params) => (params.pathOrFile === sidecar.path ? castTo<TFileOriginal>(sidecar) : null));
      setVault(createFile(`${LONG_BASENAME}.png`));

      await createHandler().fix();

      const sidecarRename = mockRenameSafe.mock.calls.find((call) => call[0].oldPathOrAbstractFile === sidecar);
      expect(sidecarRename).toBeDefined();
      expect(sidecarRename?.[0].newPath).toMatch(/\.png\.md$/);
    });
  });

  it('should leave the sidecar where it is when the pattern does not depend on the attachment name', async () => {
    mockSettings.sidecarNoteNamePattern = 'sidecar.md';
    const sidecar = createFile('sidecar.md');
    mockGetFileOrNull.mockImplementation((params) => (params.pathOrFile === sidecar.path ? castTo<TFileOriginal>(sidecar) : null));
    setVault(createFile(`${LONG_BASENAME}.png`));

    await createHandler().fix();

    expect(mockRenameSafe.mock.calls.filter((call) => call[0].oldPathOrAbstractFile === sidecar)).toHaveLength(0);
    expect(mockAddAlias).toHaveBeenCalledWith(expect.objectContaining({ pathOrFile: sidecar }));
  });

  describe('PathCompatibilityCheckResult', () => {
    it('should say so when there is nothing to report', () => {
      expect(new PathCompatibilityCheckResult().toString(app, 'report.md')).toContain('No problems found');
    });

    it('should render the warning even with no entries', () => {
      const result = new PathCompatibilityCheckResult();
      result.vaultRootWarning = 'root too long';
      expect(result.toString(app, 'report.md')).toContain('root too long');
    });

    // 200 CJK characters are 600 bytes but only 200 UTF-16 units, so Android objects to the NAME while
    // Windows — which counts units — objects only to the forbidden character and the trailing space.
    it('should render every violation type it is given', () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([PathCompatibilityPlatform.Windows, PathCompatibilityPlatform.Android]);
      setVault(createFile(`<x>${'文'.repeat(200)}.md `), createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      const rendered = result.toString(app, 'report.md');
      expect(rendered).toContain('Path is too long for Windows.');
      expect(rendered).toContain('Name is too long for Android.');
      expect(rendered).toContain('Contains a character Windows does not allow');
      expect(rendered).toContain('Name ends with a dot or a space');
      expect(rendered).toContain('Would become:');
    });

    it('should report a reserved name and a trailing character', () => {
      setVault(createFolder('CON '));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      const rendered = result.toString(app, 'report.md');
      expect(rendered).toContain('Name is reserved on Windows.');
      expect(rendered).toContain('ends with a dot or a space');
    });

    it('should say when an item cannot be repaired', () => {
      mockSettings.maxVaultRootPathLength = 258;
      setVault(createFile(`${LONG_BASENAME}.md`));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.toString(app, 'report.md')).toContain('Cannot be repaired automatically');
    });

    it('should link an item that resolves to a file, and fall back to the path otherwise', () => {
      const file = createFile(`${LONG_BASENAME}.md`);
      mockGetFileOrNull.mockReturnValue(castTo<TFileOriginal>(file));
      mockGenerateMarkdownLink.mockReturnValue('[link](x.md)');
      setVault(file);

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.toString(app, 'report.md')).toContain('[link](x.md)');
    });
  });
});
