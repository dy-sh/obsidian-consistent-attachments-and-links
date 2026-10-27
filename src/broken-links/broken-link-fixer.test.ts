import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponentDelayedNotice } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App as AppOriginal,
  CachedMetadata,
  FrontmatterLinkCache,
  Notice,
  Reference,
  ReferenceCache,
  TFile
} from 'obsidian';

import { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import { editLinks } from '@mnaoumov/obsidian-lib/link';
import { getCacheSafe } from '@mnaoumov/obsidian-lib/metadata-cache';
import { noop } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  FileSystemAdapter,
  Platform
} from 'obsidian';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinksHandler } from '../consistency-check/links-handler.ts';
import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type { PluginSettings } from '../settings/plugin-settings.ts';
import type { GitRunner } from './git-rename-history.ts';

import { BrokenLinkEvidenceKind } from './broken-link-candidates.ts';
import {
  BrokenLinkFixer,
  BrokenLinkKind
} from './broken-link-fixer.ts';

interface AdapterHolder {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace the vault adapter to exercise platform-specific behavior.
  adapter: unknown;
}

interface GlobalAppHolder {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace the app binding during setup and restore it during teardown.
  app: unknown;
}

interface MutablePlatform {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests toggle the platform flag to cover desktop and mobile behavior.
  isDesktopApp: boolean;
}

const hoisted = vi.hoisted(() => ({
  createDesktopGitRunner: vi.fn(),
  getMarkdownFilesSorted: vi.fn((): TFile[] => [])
}));

vi.mock('@mnaoumov/obsidian-lib/link', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/obsidian-lib/link')>(),
  editLinks: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/metadata-cache', () => ({
  getCacheSafe: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/vault', () => ({
  getMarkdownFilesSorted: (): TFile[] => hoisted.getMarkdownFilesSorted()
}));

vi.mock('./desktop-git-runner.ts', () => ({
  createDesktopGitRunner: hoisted.createDesktopGitRunner
}));

const mockEditLinks = vi.mocked(editLinks);
const mockGetCacheSafe = vi.mocked(getCacheSafe);

let app: AppOriginal;
let previousGlobalApp: unknown;
let isPreviousIsDesktopApp: boolean;
let validTargets: Map<Reference, TFile>;

const settings = {
  folderNoteFileNames: [] as string[],
  isPathIgnored: vi.fn((_path: string): boolean => false),
  shouldUseGitHistoryForBrokenLinks: false
};

function createFixer(): BrokenLinkFixer {
  return new BrokenLinkFixer({
    abortSignalComponent: strictProxy<AbortSignalComponent>({ abortSignal: new AbortController().signal }),
    app,
    linksHandler: strictProxy<LinksHandler>({
      resolveValidReferenceTarget: vi.fn((reference: Reference): Promise<null | TFile> => Promise.resolve(validTargets.get(reference) ?? null))
    }),
    pluginNoticeComponent: strictProxy<PluginNoticeComponent>({
      showNotice: vi.fn((): Notice => castTo<Notice>({})),
      showNoticeAfterDelay: vi.fn((): PluginNoticeComponentDelayedNotice => ({ setContent: noop, [Symbol.dispose]: noop }))
    }),
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({ settings: castTo<PluginSettings>(settings) }),
    resourceLockComponent: null
  });
}

function createFrontmatterLink(key: string, link: string): FrontmatterLinkCache {
  return { displayText: link, key, link, original: `[[${link}]]` };
}

function createLink(link: string, line: number, original = `[[${link}]]`): ReferenceCache {
  return {
    displayText: link,
    link,
    original,
    position: { end: { col: 0, line, offset: 0 }, start: { col: 0, line, offset: line * 100 } }
  };
}

async function createNote(path: string, cache: CachedMetadata | null): Promise<TFile> {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  if (folder && !app.vault.getFolderByPath(folder)) {
    await app.vault.createFolder(folder);
  }
  const file = await app.vault.create(path, '');
  caches.set(path, cache);
  return file;
}

const caches = new Map<string, CachedMetadata | null>();

describe('BrokenLinkFixer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const appMock = App.createConfigured__();
    app = castTo<AppOriginal>(appMock);
    previousGlobalApp = castTo<GlobalAppHolder>(window).app;
    castTo<GlobalAppHolder>(window).app = appMock;
    isPreviousIsDesktopApp = Platform.isDesktopApp;
    validTargets = new Map();
    caches.clear();
    settings.folderNoteFileNames = [];
    settings.shouldUseGitHistoryForBrokenLinks = false;
    settings.isPathIgnored.mockReturnValue(false);
    mockGetCacheSafe.mockImplementation((_app, pathOrFile) => Promise.resolve(castTo<Awaited<ReturnType<typeof getCacheSafe>>>(caches.get(typeof pathOrFile === 'string' ? pathOrFile : pathOrFile.path) ?? null)));
  });

  afterEach(() => {
    castTo<GlobalAppHolder>(window).app = previousGlobalApp;
    castTo<MutablePlatform>(Platform).isDesktopApp = isPreviousIsDesktopApp;
    vi.restoreAllMocks();
  });

  describe('findBrokenLinks', () => {
    it('should list every broken link, embed and frontmatter link with its candidates', async () => {
      const valid = createLink('ok.md', 1);
      const link = createLink('old/b.md', 2);
      const embed = createLink('old/c.png', 3, '![[old/c.png]]');
      const frontmatterLink = createFrontmatterLink('related', 'gone.md');
      const note = await createNote('note.md', { embeds: [embed], frontmatterLinks: [frontmatterLink], links: [valid, link] });
      await createNote('new/b.md', null);
      await createNote('ok.md', null);
      validTargets.set(valid, note);
      hoisted.getMarkdownFilesSorted.mockReturnValue([note]);

      const brokenLinks = await createFixer().findBrokenLinks();

      expect(brokenLinks.map((brokenLink) => [brokenLink.kind, brokenLink.targetPath, brokenLink.candidates.map((candidate) => candidate.path)])).toStrictEqual([
        [BrokenLinkKind.Link, 'old/b.md', ['new/b.md']],
        [BrokenLinkKind.Embed, 'old/c.png', []],
        [BrokenLinkKind.FrontmatterLink, 'gone.md', []]
      ]);
      expect(brokenLinks[0]?.sourcePath).toBe('note.md');
      expect(brokenLinks[0]?.isTargetFound).toBe(false);
    });

    it('should mark a link whose file exists as missing only its subpath, and look for no candidate', async () => {
      const link = createLink('target.md#Nowhere', 1);
      const note = await createNote('note.md', { links: [link] });
      await createNote('target.md', null);
      hoisted.getMarkdownFilesSorted.mockReturnValue([note]);

      const [brokenLink] = await createFixer().findBrokenLinks();

      expect(brokenLink?.isTargetFound).toBe(true);
      expect(brokenLink?.candidates).toStrictEqual([]);
    });

    it('should skip ignored notes and notes with no cache, and look for no candidate outside the vault', async () => {
      const ignored = await createNote('ignored.md', { links: [createLink('a.md', 1)] });
      const uncached = await createNote('uncached.md', null);
      const note = await createNote('dir/note.md', { links: [createLink('../../outside.md', 1)] });
      const noLinks = await createNote('no-links.md', {});
      await createNote('x/outside.md', null);
      settings.isPathIgnored.mockImplementation((path) => path === 'ignored.md');
      hoisted.getMarkdownFilesSorted.mockReturnValue([ignored, uncached, note, noLinks]);

      const brokenLinks = await createFixer().findBrokenLinks();

      expect(brokenLinks.map((brokenLink) => [brokenLink.targetPath, brokenLink.candidates])).toStrictEqual([['../outside.md', []]]);
    });

    it('should read aliases and titles from the frontmatter', async () => {
      const note = await createNote('note.md', { links: [createLink('old.md', 1)] });
      const renamed = await createNote('renamed.md', null);
      const titled = await createNote('titled.md', null);
      await createNote('plain.md', null);
      vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation((file) => {
        if (file === renamed) {
          return { frontmatter: { aliases: ['old'] } };
        }
        return ({ frontmatter: ({ title: file === titled ? 'old' : '' }) });
      });
      hoisted.getMarkdownFilesSorted.mockReturnValue([note]);

      const [brokenLink] = await createFixer().findBrokenLinks();

      expect(brokenLink?.candidates.map((candidate) => [candidate.path, candidate.evidence[0]?.kind])).toStrictEqual([
        ['renamed.md', BrokenLinkEvidenceKind.Alias],
        ['titled.md', BrokenLinkEvidenceKind.Title]
      ]);
    });

    it('should read git renames on desktop when the setting is on', async () => {
      const note = await createNote('note.md', { links: [createLink('old.md', 1)] });
      await createNote('new.md', null);
      hoisted.getMarkdownFilesSorted.mockReturnValue([note]);
      settings.shouldUseGitHistoryForBrokenLinks = true;
      castTo<MutablePlatform>(Platform).isDesktopApp = true;
      const adapter = castTo<FileSystemAdapter>(Object.create(FileSystemAdapter.prototype));
      adapter.getBasePath = (): string => 'C:/vault';
      castTo<AdapterHolder>(app.vault).adapter = adapter;
      const runGit = vi.fn<GitRunner>((arguments_) => Promise.resolve(arguments_[0] === 'rev-parse' ? '\n' : 'c1\0\nR100\0old.md\0new.md\0'));
      hoisted.createDesktopGitRunner.mockReturnValue(runGit);

      const [brokenLink] = await createFixer().findBrokenLinks();

      expect(hoisted.createDesktopGitRunner).toHaveBeenCalledWith('C:/vault');
      expect(brokenLink?.candidates[0]?.evidence[0]?.kind).toBe(BrokenLinkEvidenceKind.GitRename);
    });

    it('should not run git off desktop, or on an adapter with no folder', async () => {
      const note = await createNote('note.md', { links: [createLink('old.md', 1)] });
      hoisted.getMarkdownFilesSorted.mockReturnValue([note]);
      settings.shouldUseGitHistoryForBrokenLinks = true;

      castTo<MutablePlatform>(Platform).isDesktopApp = false;
      await createFixer().findBrokenLinks();
      castTo<MutablePlatform>(Platform).isDesktopApp = true;
      castTo<AdapterHolder>(app.vault).adapter = {};
      await createFixer().findBrokenLinks();

      expect(hoisted.createDesktopGitRunner).not.toHaveBeenCalled();
    });

    it('should answer no broken links for a clean vault', async () => {
      expect(await createFixer().findBrokenLinks()).toStrictEqual([]);
    });
  });

  describe('fix', () => {
    it('should rewrite only the matching links, one pass per note, and report what it applied', async () => {
      const first = createLink('old/b.md', 1, '[B](old/b.md#H)');
      const second = createLink('old/c.md', 4);
      const frontmatterLink = createFrontmatterLink('related', 'old/d.md');
      const stale = createLink('old/e.md', 7);
      const fixer = createFixer();
      const results: string[] = [];
      mockEditLinks.mockImplementation(async (params) => {
        for (const reference of [createLink('other.md', 0), { ...first, position: { ...first.position, start: { ...first.position.start, offset: 999 } } }, second, frontmatterLink, createFrontmatterLink('other', 'old/d.md'), createLink('old/e.md', 8)]) {
          const result = await params.linkConverter(reference);
          if (result) {
            results.push(result);
          }
        }
      });

      const fixes = [
        { brokenLink: { candidates: [], isTargetFound: false, kind: BrokenLinkKind.Link, reference: first, sourcePath: 'dir/note.md', targetPath: 'dir/old/b.md' }, targetPath: 'new/b.md' },
        { brokenLink: { candidates: [], isTargetFound: false, kind: BrokenLinkKind.Link, reference: second, sourcePath: 'dir/note.md', targetPath: 'dir/old/c.md' }, targetPath: 'dir/c.md' },
        { brokenLink: { candidates: [], isTargetFound: false, kind: BrokenLinkKind.FrontmatterLink, reference: frontmatterLink, sourcePath: 'other.md', targetPath: 'old/d.md' }, targetPath: 'd.md' },
        { brokenLink: { candidates: [], isTargetFound: false, kind: BrokenLinkKind.Link, reference: stale, sourcePath: 'other.md', targetPath: 'old/e.md' }, targetPath: 'e.md' }
      ];

      const applied = await fixer.fix(fixes);

      expect(mockEditLinks).toHaveBeenCalledTimes(2);
      expect(mockEditLinks.mock.calls.map(([params]) => params.pathOrFile)).toStrictEqual(['dir/note.md', 'other.md']);
      expect(results).toStrictEqual(['[B](../new/b.md#H)', '[[c.md]]', '[[d.md]]']);
      expect(applied).toStrictEqual(fixes.slice(0, 3));
    });
  });
});
