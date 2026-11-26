import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type {
  BulkOperationCommitComponent,
  BulkOperationCommitComponentRunBulkOperationParams
} from '@mnaoumov/obsidian-lib/components/bulk-operation-commit-component';
import type { LoopParams } from '@mnaoumov/obsidian-lib/loop';
import type { ResourceLockComponent } from '@mnaoumov/obsidian-lib/resource-lock';
import type {
  App as AppOriginal,
  DataAdapter,
  Notice,
  TAbstractFile,
  TFile as TFileOriginal
} from 'obsidian';

import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import {
  addAlias,
  processFrontmatter
} from '@mnaoumov/obsidian-lib/file-manager';
import {
  getFileOrNull,
  getOrCreateFile
} from '@mnaoumov/obsidian-lib/file-system';
import {
  FolderNoteLocation,
  resolveFolderNote,
  resolveFolderNoteConfig
} from '@mnaoumov/obsidian-lib/folder-note';
import { initI18N } from '@mnaoumov/obsidian-lib/i18n/i18n';
import { generateMarkdownLink } from '@mnaoumov/obsidian-lib/link';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import {
  PathCompatibilityPlatform,
  PathCompatibilityViolationType
} from '@mnaoumov/obsidian-lib/path-compatibility';
import {
  getSafeRenamePath,
  renameSafe
} from '@mnaoumov/obsidian-lib/vault';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
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

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type {
  PathCompatibilityReviewer,
  PathCompatibilityReviewParams
} from './path-compatibility-handler.ts';

import { MAX_REPORTED_ENTRIES_PER_SECTION } from '../consistency-check/report-entry-budget.ts';
import { translationsMap } from '../i18n/locales/translations-map.ts';
import {
  escapePathSettingsEntry,
  PathCompatibilityCheckResult,
  PathCompatibilityHandler
} from './path-compatibility-handler.ts';
import { UnicodeNormalizationOutcome } from './unicode-name-normalizer.ts';

const hoisted = vi.hoisted(() => ({
  basePath: 'C:/vault',
  isNormalized: vi.fn((_file: unknown): boolean => true),
  normalize: vi.fn<(file: unknown) => Promise<string>>()
}));

interface DataAdapterExLike {
  readonly basePath: string;
}

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getDataAdapterEx: (): DataAdapterExLike => ({ basePath: hoisted.basePath })
}));

// The on-disk half is `unicode-name-normalizer.test.ts`'s subject; here only the routing to it is.
vi.mock('./unicode-name-normalizer.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./unicode-name-normalizer.ts')>()),
  UnicodeNameNormalizer: class {
    public isNormalized = hoisted.isNormalized;
    public normalize = hoisted.normalize;
  }
}));

vi.mock('@mnaoumov/obsidian-lib/file-manager', () => ({
  addAlias: vi.fn(() => noopAsync()),
  processFrontmatter: vi.fn(() => noopAsync())
}));

// Spread the real module: `isFolder` / `isMarkdownFile` / `asFile` do the type routing this handler is built
// on, and a stub of them would be testing the stub.
vi.mock('@mnaoumov/obsidian-lib/file-system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mnaoumov/obsidian-lib/file-system')>()),
  getFileOrNull: vi.fn(),
  getOrCreateFile: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/folder-note', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mnaoumov/obsidian-lib/folder-note')>()),
  resolveFolderNote: vi.fn(),
  resolveFolderNoteConfig: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/link', () => ({
  generateMarkdownLink: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/loop', () => ({
  loop: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/vault', () => ({
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
const mockEditAndSave = vi.fn(async (editor: (settings: PluginSettings) => void): Promise<void> => {
  editor(castTo<PluginSettings>(mockSettings));
  await noopAsync();
});

// Ticks every entry, unrepairable ones included, so the handler's own outcome for each is still exercised.
function tickAll(params: PathCompatibilityReviewParams): Promise<null | ReadonlySet<string>> {
  return Promise.resolve(new Set(params.entries.map((entry) => entry.path)));
}

const mockReviewRepairs = vi.fn<PathCompatibilityReviewer>();
const mockRunBulkOperation = vi.fn(async (params: BulkOperationCommitComponentRunBulkOperationParams<unknown>): Promise<unknown> => await params.operation());

// The fixtures only ever carry the vault, never call through it, so a strict proxy makes any real use throw
// rather than quietly succeed.
const vault = Vault.create2__(strictProxy<DataAdapter>({}));
const loadedFiles: TAbstractFile[] = [];

const mockSettings = {
  forbiddenCharacterReplacement: '-',
  forbiddenCharacterReplacements: [] as string[],
  getPathCompatibilityPlatforms: vi.fn((): PathCompatibilityPlatform[] => [PathCompatibilityPlatform.Windows]),
  isPathIgnoredByPathCompatibility: vi.fn((_path: string, _isFolder?: boolean): boolean => false),
  maxVaultRootPathLength: 0,
  pathCompatibilityExcludePaths: [] as string[],
  shouldAddOriginalNameAsAlias: true,
  shouldCreateNoteToPreserveOriginalName: false,
  shouldNormalizeUnicodeNames: false,
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
    bulkOperationCommitComponent: strictProxy<BulkOperationCommitComponent>({ runBulkOperation: castTo<BulkOperationCommitComponent['runBulkOperation']>(mockRunBulkOperation) }),
    pluginNoticeComponent: mockPluginNoticeComponent,
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({ editAndSave: mockEditAndSave, settings: castTo<PluginSettings>(mockSettings) }),
    resourceLockComponent: castTo<null | ResourceLockComponent>(null),
    reviewRepairs: mockReviewRepairs
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
    mockSettings.isPathIgnoredByPathCompatibility.mockReturnValue(false);
    mockSettings.forbiddenCharacterReplacement = '-';
    mockSettings.forbiddenCharacterReplacements = [];
    mockSettings.maxVaultRootPathLength = 0;
    mockSettings.pathCompatibilityExcludePaths = [];
    mockReviewRepairs.mockImplementation(tickAll);
    mockSettings.shouldAddOriginalNameAsAlias = true;
    mockSettings.shouldCreateNoteToPreserveOriginalName = false;
    mockSettings.shouldNormalizeUnicodeNames = false;
    mockSettings.sidecarNoteNamePattern = '{{fileName}}.md';
    hoisted.isNormalized.mockReturnValue(true);
    hoisted.normalize.mockResolvedValue(UnicodeNormalizationOutcome.Normalized);
    mockGetFileOrNull.mockReturnValue(null);
    mockGetSafeRenamePath.mockImplementation((params) => params.newPath);
    // Mimic the real rename: it mutates the abstract file, which is what the sidecar and preservation steps
    // read afterwards.
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
      mockSettings.isPathIgnoredByPathCompatibility.mockReturnValue(true);
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
      expect(mockRunBulkOperation).not.toHaveBeenCalled();
    });

    it('should run the repair as one bulk operation, with the renames inside it', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));
      let isInsideOperation = false;
      mockRunBulkOperation.mockImplementationOnce(async (params) => {
        isInsideOperation = true;
        try {
          return await params.operation();
        } finally {
          isInsideOperation = false;
        }
      });
      const renamedInsideOperation: boolean[] = [];
      const renameImplementation = mockRenameSafe.getMockImplementation();
      mockRenameSafe.mockImplementationOnce(async (params) => {
        renamedInsideOperation.push(isInsideOperation);
        return await ensureNonNullable(renameImplementation)(params);
      });

      await createHandler().fix();

      expect(mockRunBulkOperation).toHaveBeenCalledTimes(1);
      expect(mockRunBulkOperation.mock.calls[0]?.[0].summary).toBe('Fix 1 incompatible path(s) ticked in the review');
      expect(renamedInsideOperation).toStrictEqual([true]);
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
      expect(mockReviewRepairs).not.toHaveBeenCalled();
      expect(mockRunBulkOperation).not.toHaveBeenCalled();
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
      setVault(createFile(`${LONG_BASENAME}.md`));

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

  describe('review', () => {
    it('should show the planned renames before renaming anything', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`), createFile('ordinary.md'));
      mockReviewRepairs.mockImplementationOnce(async (params) => {
        expect(mockRenameSafe).not.toHaveBeenCalled();
        expect(params.entries.map((entry) => entry.path)).toStrictEqual([`${LONG_BASENAME}.md`]);
        expect(params.entries[0]?.newPath).not.toBeNull();
        expect(params.entries[0]?.violations).not.toHaveLength(0);
        return await tickAll(params);
      });

      await createHandler().fix();

      expect(mockReviewRepairs).toHaveBeenCalledTimes(1);
      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
    });

    it('should rename nothing and make no commit when the review is cancelled', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));
      mockReviewRepairs.mockResolvedValueOnce(null);

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockRunBulkOperation).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).not.toHaveBeenCalled();
    });

    it('should rename only the ticked items', async () => {
      const ticked = createFile(`${LONG_BASENAME}.md`);
      const unticked = createFile('a?b.md');
      setVault(ticked, unticked);
      mockReviewRepairs.mockResolvedValueOnce(new Set([`${LONG_BASENAME}.md`]));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
      expect(mockRenameSafe).toHaveBeenCalledWith(expect.objectContaining({ oldPathOrAbstractFile: ticked }));
      expect(mockRunBulkOperation.mock.calls[0]?.[0].summary).toBe('Fix 1 incompatible path(s) ticked in the review');
    });

    it('should say there is nothing to repair when every item was unticked', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));
      mockReviewRepairs.mockResolvedValueOnce(new Set());

      await createHandler().fix();

      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockRunBulkOperation).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('No paths found'));
    });

    it('should re-judge a ticked item at repair time and leave it alone once it no longer offends', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));
      mockReviewRepairs.mockImplementationOnce(async (params) => {
        // As if the settings changed while the review was open.
        mockSettings.isPathIgnoredByPathCompatibility.mockReturnValue(true);
        return await tickAll(params);
      });

      await createHandler().fix();

      expect(mockRunBulkOperation).toHaveBeenCalledTimes(1);
      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('No paths found'));
    });

    it('should keep an item out for good through the review\'s keep action', async () => {
      setVault(createFile('2025[1]?.md'));
      mockReviewRepairs.mockImplementationOnce(async (params) => {
        await params.keepPath('2025[1]?.md');
        return new Set();
      });

      await createHandler().fix();

      expect(mockEditAndSave).toHaveBeenCalledTimes(1);
      expect(mockSettings.pathCompatibilityExcludePaths).toStrictEqual(['2025\\[1]\\?.md']);
    });
  });

  describe('keepPath', () => {
    it('should append an escaped plain-path entry once', async () => {
      mockSettings.pathCompatibilityExcludePaths = ['Books/'];
      const handler = createHandler();

      await handler.keepPath('a*b.md');
      await handler.keepPath('a*b.md');

      expect(mockSettings.pathCompatibilityExcludePaths).toStrictEqual(['Books/', 'a\\*b.md']);
    });
  });

  describe('escapePathSettingsEntry', () => {
    it('should escape every glob character and the backslash, and nothing else', () => {
      expect(escapePathSettingsEntry('a*b?c[d]e\\f g.md')).toBe('a\\*b\\?c\\[d]e\\\\f g.md');
      expect(escapePathSettingsEntry('plain/path.md')).toBe('plain/path.md');
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

    it.each([null, ''])('should write the title over an empty one (%j)', async (emptyTitle) => {
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      const frontmatter: Record<string, unknown> = { title: emptyTitle };
      await mockProcessFrontmatter.mock.calls[0]?.[0].frontmatterFunction(frontmatter, new AbortController().signal);
      expect(frontmatter['title']).toBe(`${LONG_BASENAME}.md`);
    });

    // The title may be the note's true name, which the file name only approximates.
    it('should keep a title the note already has', async () => {
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      const frontmatter: Record<string, unknown> = { title: 'The true name: with a colon' };
      await mockProcessFrontmatter.mock.calls[0]?.[0].frontmatterFunction(frontmatter, new AbortController().signal);
      expect(frontmatter['title']).toBe('The true name: with a colon');
    });

    it('should not add an alias when that is turned off', async () => {
      mockSettings.shouldAddOriginalNameAsAlias = false;
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(mockAddAlias).not.toHaveBeenCalled();
      expect(mockProcessFrontmatter).toHaveBeenCalledTimes(1);
    });

    it('should replace a forbidden character with the configured replacement', async () => {
      mockSettings.forbiddenCharacterReplacement = '_';
      setVault(createFile('a?b.md'));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledWith(expect.objectContaining({ newPath: 'a_b.md' }));
    });

    it('should prefer a per-character replacement and fall back to the single one for the rest', async () => {
      mockSettings.forbiddenCharacterReplacements = [':= -', '?=', '[=(', ']=)'];
      setVault(createFile('Q1: why [draft]? *.md'));

      await createHandler().fix();

      expect(mockRenameSafe).toHaveBeenCalledWith(expect.objectContaining({ newPath: 'Q1 - why (draft) -.md' }));
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
      // and the mocked rename moves it in between.
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
      // and the mocked rename moves it in between.
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

  describe('Unicode normalization', () => {
    beforeEach(() => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([]);
      mockSettings.shouldNormalizeUnicodeNames = true;
      hoisted.isNormalized.mockReturnValue(false);
    });

    it('should report a name stored in NFD even with no platform enabled, and keep its path', () => {
      mockSettings.maxVaultRootPathLength = 3;
      setVault(createFile('note.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]?.newPath).toBe('note.md');
      // The vault root budget is a platform rule, so with no platform on there is nothing to warn about.
      expect(result.vaultRootWarning).toBeNull();
      expect(result.toString(app, 'report.md')).toContain('decomposed Unicode form (NFD)');
    });

    it('should not report it when the setting is off', () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([PathCompatibilityPlatform.Windows]);
      mockSettings.shouldNormalizeUnicodeNames = false;
      setVault(createFile('note.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.entries).toHaveLength(0);
    });

    it('should repair it on disk rather than through a vault rename', async () => {
      const file = createFile('note.md');
      setVault(file);

      await createHandler().fix();

      expect(hoisted.normalize).toHaveBeenCalledWith(file);
      expect(mockRenameSafe).not.toHaveBeenCalled();
      expect(mockAddAlias).not.toHaveBeenCalled();
      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Repaired 1'));
    });

    // `adapter.rename` reads the old name from `realpath`, so the vault rename writes the NFC name on its own.
    it('should leave a name that also breaks a platform rule to the vault rename', async () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([PathCompatibilityPlatform.Windows]);
      setVault(createFile(`${LONG_BASENAME}.md`));

      await createHandler().fix();

      expect(hoisted.normalize).not.toHaveBeenCalled();
      expect(mockRenameSafe).toHaveBeenCalledTimes(1);
    });

    it('should list a name whose NFC spelling is already taken on disk', async () => {
      hoisted.normalize.mockResolvedValue(UnicodeNormalizationOutcome.Collision);
      setVault(createFile('note.md'));

      await createHandler().fix();

      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('Did not normalize 1 name(s) to NFC: note.md'));
    });

    it('should count nothing when the name turned out to be NFC already', async () => {
      hoisted.normalize.mockResolvedValue(UnicodeNormalizationOutcome.NotNeeded);
      setVault(createFile('note.md'));

      await createHandler().fix();

      expect(mockPluginNoticeComponent.showNotice).toHaveBeenCalledWith(expect.stringContaining('No paths found'));
    });
  });

  describe('PathCompatibilityCheckResult', () => {
    it('should say so when there is nothing to report', () => {
      expect(new PathCompatibilityCheckResult().toString(app, 'report.md')).toContain('No problems found');
    });

    it('should list at most the section limit and say how many items it left out', () => {
      const result = new PathCompatibilityCheckResult();
      for (let index = 0; index < MAX_REPORTED_ENTRIES_PER_SECTION + 2; index++) {
        result.add({ newPath: null, path: `item-${String(index)}`, violations: [] });
      }

      const rendered = result.toString(app, 'report.md');
      expect(rendered).toContain(`(0 in ${String(MAX_REPORTED_ENTRIES_PER_SECTION + 2)} items)`);
      expect(rendered).toContain(`\`item-${String(MAX_REPORTED_ENTRIES_PER_SECTION - 1)}\``);
      expect(rendered).not.toContain(`\`item-${String(MAX_REPORTED_ENTRIES_PER_SECTION)}\``);
      expect(rendered).toContain('> [!warning]- `item-0` (0)\n> - Cannot be repaired automatically: every character of the name would have to be removed.\n\n');
      expect(rendered).toContain('Not listed: 2 more.');
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
      expect(rendered).toMatch(/Path is \d+ characters long, over the 259 Windows allows\. That counts \d+ for the vault root and 1 for the separator after it\./);
      expect(rendered).toContain('Name is 607 bytes long, over the 255 Android allows.');
      expect(rendered).toContain('Contains `<`, `>`, which Windows does not allow in a name.');
      expect(rendered).toContain('Name ends with a dot or a space');
      expect(rendered).toContain('Would become:');
    });

    // Owner's report, 2026-10-29: `[` and `]` were blamed on Windows, which stores the name fine.
    it('should blame Obsidian, not a platform, for a character only Obsidian links refuse', () => {
      setVault(createFile('At A Glance 2025[1].pptx'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      const rendered = result.toString(app, 'report.md');
      expect(rendered).toContain('Contains `[`, `]`, which Obsidian links do not work with. The file system stores the name fine.');
      expect(rendered).not.toContain('Windows');
    });

    // An entry is public and can be added by hand; a violation built without its details still renders.
    it('should render a violation that carries no characters or measurement', () => {
      const result = new PathCompatibilityCheckResult();
      result.add({
        newPath: null,
        path: 'a.md',
        violations: [
          { platform: PathCompatibilityPlatform.Windows, type: PathCompatibilityViolationType.ForbiddenCharacter },
          { platform: PathCompatibilityPlatform.Windows, type: PathCompatibilityViolationType.NameTooLong }
        ]
      });

      const rendered = result.toString(app, 'report.md');
      expect(rendered).toContain('Contains , which Windows does not allow in a name.');
      expect(rendered).toContain('Name is 0 characters long, over the 0 Windows allows.');
    });

    it('should name a control character by its code point', () => {
      mockSettings.getPathCompatibilityPlatforms.mockReturnValue([PathCompatibilityPlatform.Linux]);
      setVault(createFile('a\u{0}b.md'));

      const result = new PathCompatibilityCheckResult();
      createHandler().check(result);

      expect(result.toString(app, 'report.md')).toContain('Contains U+0000, which Linux does not allow in a name.');
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
