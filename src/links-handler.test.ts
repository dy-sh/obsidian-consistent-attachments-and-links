import type {
  App,
  FrontmatterLinkCache,
  Reference,
  ReferenceCache,
  TFile
} from 'obsidian';
import type { FileChange } from 'obsidian-dev-utils/obsidian/file-change';
import type {
  Mock,
  MockInstance
} from 'vitest';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  normalizePath,
  resolveSubpath
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { applyFileChanges } from 'obsidian-dev-utils/obsidian/file-change';
import { getFileOrNull } from 'obsidian-dev-utils/obsidian/file-system';
import {
  extractLinkFile,
  generateMarkdownLink,
  splitSubpath,
  testWikilink,
  updateLinksInFile
} from 'obsidian-dev-utils/obsidian/link';
import {
  getAllLinks,
  getBacklinksForFileSafe,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import { referenceToFileChange } from 'obsidian-dev-utils/obsidian/reference';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { resolveValue } from 'obsidian-dev-utils/value-provider';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return {
    ...actual,
    normalizePath: vi.fn(),
    resolveSubpath: vi.fn()
  };
});

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  isFrontmatterLinkCache: vi.fn(),
  isReferenceCache: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-change', () => ({
  applyFileChanges: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', () => ({
  getFileOrNull: vi.fn(),
  MARKDOWN_FILE_EXTENSION: 'md'
}));

vi.mock('obsidian-dev-utils/obsidian/link', () => ({
  extractLinkFile: vi.fn(),
  generateMarkdownLink: vi.fn(),
  LinkPathStyle: {
    ObsidianSettingsDefault: 'ObsidianSettingsDefault',
    RelativePathToTheSource: 'RelativePathToTheSource'
  },
  LinkStyle: {
    Markdown: 'Markdown',
    Wikilink: 'Wikilink'
  },
  splitSubpath: vi.fn(),
  testWikilink: vi.fn(),
  updateLinksInFile: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getAllLinks: vi.fn(),
  getBacklinksForFileSafe: vi.fn(),
  getCacheSafe: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/reference', () => ({
  referenceToFileChange: vi.fn()
}));

vi.mock('obsidian-dev-utils/path', () => ({
  dirname: vi.fn((p: string) => {
    const idx = p.lastIndexOf('/');
    return idx === -1 ? '' : p.slice(0, idx);
  }),
  join: vi.fn((...parts: string[]) => parts.filter((p) => p !== '').join('/'))
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';

interface ConvertLinkParams {
  readonly forceRelativePath?: boolean;
  readonly link: Reference;
  readonly note: TFile;
  readonly oldNotePath: string;
  readonly pathChangeMap?: Map<string, string>;
}

interface LinksHandlerPrivate {
  convertAllNoteRefPathsToRelative(notePath: string, isEmbed: boolean, abortSignal: AbortSignal): Promise<unknown[]>;
  convertLink(params: ConvertLinkParams): string;
  isValidLink(link: Reference, notePath: string): Promise<boolean>;
  updateLinks(note: TFile, oldNotePath: string, pathChangeMap?: Map<string, string>): Promise<void>;
}

interface ParentLike {
  path: string;
}

interface SettingsLike {
  isPathIgnored(path: string): boolean;
}

const mockIsFrontmatterLinkCache = vi.mocked(isFrontmatterLinkCache);
const mockIsReferenceCache = vi.mocked(isReferenceCache);
const mockNormalizePath = vi.mocked(normalizePath);
const mockResolveSubpath = vi.mocked(resolveSubpath);
const mockApplyFileChanges = vi.mocked(applyFileChanges);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockExtractLinkFile = vi.mocked(extractLinkFile);
const mockGenerateMarkdownLink = vi.mocked(generateMarkdownLink);
const mockSplitSubpath = vi.mocked(splitSubpath);
const mockTestWikilink = vi.mocked(testWikilink);
const mockUpdateLinksInFile = vi.mocked(updateLinksInFile);
const mockGetAllLinks = vi.mocked(getAllLinks);
const mockGetBacklinksForFileSafe = vi.mocked(getBacklinksForFileSafe);
const mockGetCacheSafe = vi.mocked(getCacheSafe);
const mockReferenceToFileChange = vi.mocked(referenceToFileChange);

function asPrivate(handler: LinksHandler): LinksHandlerPrivate {
  return castTo<LinksHandlerPrivate>(handler);
}

function createFile(path: string, extension = 'md', parent: null | ParentLike = { path: '' }): TFile {
  return strictProxy<TFile>({
    extension,
    parent: parent === null ? null : strictProxy<TFile['parent']>(parent),
    path
  });
}

function createRef(overrides: Partial<Reference> = {}): Reference {
  return strictProxy<Reference>({
    displayText: '',
    link: 'link',
    original: '[[link]]',
    ...overrides
  });
}

function createReferenceCache(overrides: Partial<FrontmatterLinkCache & ReferenceCache> = {}): ReferenceCache {
  return castTo<ReferenceCache>({
    displayText: '',
    link: 'link',
    original: '[[link]]',
    position: {
      end: { col: 0, line: 0, offset: 0 },
      start: { col: 0, line: 0, offset: 0 }
    },
    ...overrides
  });
}

describe('LinksHandler', () => {
  let app: App;
  let cachedRead: Mock<(file: TFile) => Promise<string>>;
  let handler: LinksHandler;
  let pluginSettingsComponent: PluginSettingsComponent;
  let settings: SettingsLike;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      isPathIgnored: vi.fn().mockReturnValue(false)
    };
    cachedRead = vi.fn<(file: TFile) => Promise<string>>().mockResolvedValue('content');
    app = strictProxy<App>({
      vault: strictProxy<App['vault']>({
        cachedRead
      })
    });
    pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
      settings: castTo<PluginSettingsComponent['settings']>(settings)
    });
    handler = new LinksHandler({
      app,
      pluginSettingsComponent
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockNormalizePath.mockImplementation((p: string) => p.replace(/^\//, ''));
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('getFullPathForLink', () => {
    it('should join the parent folder with the link path', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      expect(handler.getFullPathForLink('img.png', 'folder/note.md')).toBe('folder/img.png');
    });

    it('should handle a note at the vault root', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      expect(handler.getFullPathForLink('img.png', 'note.md')).toBe('img.png');
    });
  });

  describe('getCachedNotesThatHaveLinkToFile', () => {
    it('should return an empty array when the file is not found', async () => {
      mockGetFileOrNull.mockReturnValue(null);
      expect(await handler.getCachedNotesThatHaveLinkToFile('missing.png')).toEqual([]);
    });

    it('should return the backlink keys', async () => {
      mockGetFileOrNull.mockReturnValue(createFile('img.png'));
      mockGetBacklinksForFileSafe.mockResolvedValue(strictProxy<Awaited<ReturnType<typeof getBacklinksForFileSafe>>>({
        keys: () => ['a.md', 'b.md']
      }));
      expect(await handler.getCachedNotesThatHaveLinkToFile('img.png')).toEqual(['a.md', 'b.md']);
    });
  });

  describe('checkConsistency', () => {
    function createResult(): ConsistencyCheckResult {
      return new ConsistencyCheckResult('title');
    }

    it('should return early when the note path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      const badLinks = createResult();
      await handler.checkConsistency(createFile('note.md'), badLinks, createResult(), createResult(), createResult(), createResult());
      expect(badLinks.size).toBe(0);
    });

    it('should return early when there is no cache', async () => {
      mockGetCacheSafe.mockResolvedValue(null);
      const badLinks = createResult();
      await handler.checkConsistency(createFile('note.md'), badLinks, createResult(), createResult(), createResult(), createResult());
      expect(badLinks.size).toBe(0);
    });

    it('should record bad links, embeds, wikilinks and frontmatter links', async () => {
      const link = createReferenceCache({ link: 'bad', original: '[[bad]]' });
      const embed = createReferenceCache({ link: 'bad-embed', original: '![[bad-embed]]' });
      const fmLink = createReferenceCache({ key: 'prop', link: 'bad-fm', original: 'bad-fm' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [embed],
        frontmatterLinks: [fmLink],
        links: [link]
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'bad', subpath: '' });
      mockGetFileOrNull.mockReturnValue(null);
      mockTestWikilink.mockReturnValue(true);

      const badLinks = createResult();
      const badEmbeds = createResult();
      const wikiLinks = createResult();
      const wikiEmbeds = createResult();
      const badFrontmatterLinks = createResult();
      await handler.checkConsistency(createFile('note.md'), badLinks, badEmbeds, wikiLinks, wikiEmbeds, badFrontmatterLinks);

      expect(badLinks.get('note.md')).toEqual([link]);
      expect(badEmbeds.get('note.md')).toEqual([embed]);
      expect(wikiLinks.get('note.md')).toEqual([link]);
      expect(wikiEmbeds.get('note.md')).toEqual([embed]);
      expect(badFrontmatterLinks.get('note.md')).toEqual([fmLink]);
    });

    it('should not record valid links or non-wikilinks', async () => {
      const link = createReferenceCache({ link: 'good', original: '[good](good)' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [],
        frontmatterLinks: [],
        links: [link]
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'good', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('good.md'));
      mockTestWikilink.mockReturnValue(false);

      const badLinks = createResult();
      const wikiLinks = createResult();
      await handler.checkConsistency(createFile('note.md'), badLinks, createResult(), wikiLinks, createResult(), createResult());
      expect(badLinks.size).toBe(0);
      expect(wikiLinks.size).toBe(0);
    });

    it('should not record valid embeds or valid frontmatter links', async () => {
      const embed = createReferenceCache({ link: 'good-embed', original: '![[good-embed]]' });
      const fmLink = createReferenceCache({ key: 'prop', link: 'good-fm', original: 'good-fm' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [embed],
        frontmatterLinks: [fmLink],
        links: []
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'good', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('good.md'));
      mockTestWikilink.mockReturnValue(false);

      const badEmbeds = createResult();
      const badFrontmatterLinks = createResult();
      const wikiEmbeds = createResult();
      await handler.checkConsistency(createFile('note.md'), createResult(), badEmbeds, createResult(), wikiEmbeds, badFrontmatterLinks);
      expect(badEmbeds.size).toBe(0);
      expect(wikiEmbeds.size).toBe(0);
      expect(badFrontmatterLinks.size).toBe(0);
    });

    it('should default missing cache arrays to empty', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      const badLinks = createResult();
      await handler.checkConsistency(createFile('note.md'), badLinks, createResult(), createResult(), createResult(), createResult());
      expect(badLinks.size).toBe(0);
    });
  });

  describe('isValidLink', () => {
    it('should resolve to the note itself when linkPath is empty', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: '', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(true);
    });

    it('should normalize an absolute linkPath', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: '/abs/img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('abs/img.png'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(true);
      expect(mockNormalizePath).toHaveBeenCalledWith('/abs/img.png');
    });

    it('should join a relative linkPath with the note dir', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('folder/img.png'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'folder/note.md')).toBe(true);
    });

    it('should return false when the file does not exist', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(null);
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(false);
    });

    it('should return true when there is no subpath', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('img.png'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(true);
    });

    it('should accept #page= subpath for a pdf', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'doc.pdf', subpath: '#page=2' });
      mockGetFileOrNull.mockReturnValue(createFile('doc.pdf', 'PDF'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(true);
    });

    it('should reject non-page subpath for a pdf', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'doc.pdf', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(createFile('doc.pdf', 'pdf'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(false);
    });

    it('should return false when subpath used on a non-markdown, non-pdf file', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '#x' });
      mockGetFileOrNull.mockReturnValue(createFile('img.png', 'png'));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(false);
    });

    it('should return false when the markdown file has no cache', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(createFile('other.md', 'md'));
      mockGetCacheSafe.mockResolvedValue(null);
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(false);
    });

    it('should return true when the subpath resolves in the markdown cache', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(createFile('other.md', 'md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockResolveSubpath.mockReturnValue(strictProxy<ReturnType<typeof resolveSubpath>>({}));
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(true);
    });

    it('should return false when the subpath does not resolve in the markdown cache', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#missing' });
      mockGetFileOrNull.mockReturnValue(createFile('other.md', 'md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockResolveSubpath.mockReturnValue(null);
      expect(await asPrivate(handler).isValidLink(createRef(), 'note.md')).toBe(false);
    });
  });

  describe('replaceAllNoteWikilinksWithMarkdownLinks', () => {
    let abortSignal: AbortSignal;

    beforeEach(() => {
      abortSignal = new AbortController().signal;
    });

    it('should return 0 when the note path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('ignored.md', false, abortSignal)).toBe(0);
    });

    it('should warn and return 0 when the note file is not found', async () => {
      mockGetFileOrNull.mockReturnValue(null);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('missing.md', false, abortSignal)).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('file not found'));
    });

    it('should return 0 when there is no cache', async () => {
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      mockGetCacheSafe.mockResolvedValue(null);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('note.md', false, abortSignal)).toBe(0);
    });

    it('should count wikilinks among links and update the file', async () => {
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        links: [createReferenceCache({ original: '[[a]]' }), createReferenceCache({ original: '[b](b)' })]
      }));
      mockTestWikilink.mockImplementation((original: string) => original.startsWith('[['));
      mockUpdateLinksInFile.mockResolvedValue(undefined);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('note.md', false, abortSignal)).toBe(1);
      expect(mockUpdateLinksInFile).toHaveBeenCalledWith(expect.objectContaining({ shouldUpdateEmbedOnlyLinks: false }));
    });

    it('should count embeds when embedOnlyLinks is true', async () => {
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [createReferenceCache({ original: '![[a]]' })]
      }));
      mockTestWikilink.mockReturnValue(true);
      mockUpdateLinksInFile.mockResolvedValue(undefined);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('note.md', true, abortSignal)).toBe(1);
      expect(mockUpdateLinksInFile).toHaveBeenCalledWith(expect.objectContaining({ shouldUpdateEmbedOnlyLinks: true }));
    });

    it('should default missing embeds to empty', async () => {
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockUpdateLinksInFile.mockResolvedValue(undefined);
      expect(await handler.replaceAllNoteWikilinksWithMarkdownLinks('note.md', true, abortSignal)).toBe(0);
    });

    it('should throw when aborted after reading the cache', async () => {
      const controller = new AbortController();
      mockGetFileOrNull.mockReturnValue(createFile('note.md'));
      mockGetCacheSafe.mockImplementation(async () => {
        controller.abort();
        return Promise.resolve(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      });
      await expect(handler.replaceAllNoteWikilinksWithMarkdownLinks('note.md', false, controller.signal)).rejects.toThrow();
    });
  });

  describe('updateChangedPathsInNote', () => {
    it('should return early when the note path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      await handler.updateChangedPathsInNote('ignored.md', []);
      expect(mockApplyFileChanges).not.toHaveBeenCalled();
    });

    it('should warn and return when the note is not found', async () => {
      mockGetFileOrNull.mockReturnValue(null);
      await handler.updateChangedPathsInNote('missing.md', []);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('file not found'));
    });

    it('should build the path change map and apply changes', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      mockApplyFileChanges.mockResolvedValue(undefined);
      await handler.updateChangedPathsInNote('note.md', [{ newPath: 'new.png', oldPath: 'old.png' }]);
      expect(mockApplyFileChanges).toHaveBeenCalledWith(app, note, expect.any(Function));
    });
  });

  describe('convertAllNoteEmbedsPathsToRelative / convertAllNoteLinksPathsToRelative', () => {
    let abortSignal: AbortSignal;

    beforeEach(() => {
      abortSignal = new AbortController().signal;
    });

    it('should delegate embeds conversion with isEmbed true', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      expect(await handler.convertAllNoteEmbedsPathsToRelative('ignored.md', abortSignal)).toEqual([]);
    });

    it('should delegate links conversion with isEmbed false', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      expect(await handler.convertAllNoteLinksPathsToRelative('ignored.md', abortSignal)).toEqual([]);
    });
  });

  describe('convertAllNoteRefPathsToRelative', () => {
    let abortSignal: AbortSignal;

    beforeEach(() => {
      abortSignal = new AbortController().signal;
    });

    it('should return empty when the note is not found', async () => {
      mockGetFileOrNull.mockReturnValue(null);
      expect(await asPrivate(handler).convertAllNoteRefPathsToRelative('missing.md', false, abortSignal)).toEqual([]);
    });

    it('should convert refs and collect change infos', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      const ref = createReferenceCache({ link: 'img.png', original: '![[img.png]]' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({ embeds: [ref], links: [] }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockGetFileOrNull.mockReturnValue(note);
      mockGenerateMarkdownLink.mockReturnValue('![](img.png)');
      mockReferenceToFileChange.mockReturnValue(castTo<FileChange>({ newContent: '![](img.png)' }));
      cachedRead.mockResolvedValue('content');

      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });

      const result = await asPrivate(handler).convertAllNoteRefPathsToRelative('note.md', true, abortSignal);
      expect(result).toEqual([{ newLink: '![](img.png)', old: ref }]);
    });

    it('should convert links when isEmbed is false', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      const ref = createReferenceCache({ link: 'a.md', original: '[[a.md]]' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({ embeds: [], links: [ref] }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'a.md', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('a.md'));
      mockGenerateMarkdownLink.mockReturnValue('[a](a.md)');
      mockReferenceToFileChange.mockReturnValue(castTo<FileChange>({ newContent: '[a](a.md)' }));
      cachedRead.mockResolvedValue('content');
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      const result = await asPrivate(handler).convertAllNoteRefPathsToRelative('note.md', false, abortSignal);
      expect(result).toEqual([{ newLink: '[a](a.md)', old: ref }]);
    });

    it('should default missing refs to empty when the cache has no embeds key', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      cachedRead.mockResolvedValue('content');
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      const result = await asPrivate(handler).convertAllNoteRefPathsToRelative('note.md', true, abortSignal);
      expect(result).toEqual([]);
    });

    it('should return null from the handler when content has changed', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({ embeds: [], links: [] }));
      cachedRead.mockResolvedValue('different');
      let handlerResult: unknown;
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        handlerResult = await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      const result = await asPrivate(handler).convertAllNoteRefPathsToRelative('note.md', true, abortSignal);
      expect(handlerResult).toBeNull();
      expect(result).toEqual([]);
    });

    it('should return empty changes when there is no cache', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      mockGetCacheSafe.mockResolvedValue(null);
      cachedRead.mockResolvedValue('content');
      let handlerResult: unknown;
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        handlerResult = await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      const result = await asPrivate(handler).convertAllNoteRefPathsToRelative('note.md', false, abortSignal);
      expect(handlerResult).toEqual([]);
      expect(result).toEqual([]);
    });
  });

  describe('updateLinks (via updateChangedPathsInNote)', () => {
    it('should map all links to file changes', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      const link = createReferenceCache({ link: 'old.png', original: '[[old.png]]' });
      const abortSignal = new AbortController().signal;
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockGetAllLinks.mockReturnValue([link]);
      mockSplitSubpath.mockReturnValue({ linkPath: 'old.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('old.png'));
      mockGenerateMarkdownLink.mockReturnValue('[[new.png]]');
      mockReferenceToFileChange.mockReturnValue(castTo<FileChange>({ newContent: '[[new.png]]' }));
      cachedRead.mockResolvedValue('content');

      await handler.updateChangedPathsInNote('note.md', [{ newPath: 'new.png', oldPath: 'old.png' }]);
      expect(mockReferenceToFileChange).toHaveBeenCalled();
    });

    it('should return null when content changed', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      const abortSignal = new AbortController().signal;
      let handlerResult: unknown;
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        handlerResult = await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      cachedRead.mockResolvedValue('different');
      await handler.updateChangedPathsInNote('note.md', []);
      expect(handlerResult).toBeNull();
    });

    it('should return empty changes when there is no cache', async () => {
      const note = createFile('note.md');
      mockGetFileOrNull.mockReturnValue(note);
      const abortSignal = new AbortController().signal;
      let handlerResult: unknown;
      mockApplyFileChanges.mockImplementation(async (_app, _note, handlerFn) => {
        handlerResult = await resolveValue(handlerFn, { abortSignal, content: 'content' });
      });
      mockGetCacheSafe.mockResolvedValue(null);
      cachedRead.mockResolvedValue('content');
      await handler.updateChangedPathsInNote('note.md', []);
      expect(handlerResult).toEqual([]);
    });
  });

  describe('convertLink', () => {
    it('should return the original link when there is no new link path', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(null);
      const note = createFile('note.md');
      const link = createRef({ original: '[[img.png]]' });
      const pathChangeMap = new Map<string, string>();
      expect(asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md', pathChangeMap })).toBe('[[img.png]]');
    });

    it('should return the original link when the target file cannot be resolved', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockGetFileOrNull.mockReturnValue(null);
      const note = createFile('note.md');
      const link = createRef({ original: '[[img.png]]' });
      expect(asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md' })).toBe('[[img.png]]');
    });

    it('should generate a relative markdown link when forceRelativePath is set', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      const target = createFile('img.png');
      mockGetFileOrNull.mockReturnValue(target);
      mockGenerateMarkdownLink.mockReturnValue('![](../img.png)');
      const note = createFile('note.md', 'md', { path: 'folder' });
      const link = createRef({ displayText: 'caption', original: '![[img.png]]' });
      const result = asPrivate(handler).convertLink({ forceRelativePath: true, link, note, oldNotePath: 'note.md' });
      expect(result).toBe('![](../img.png)');
      expect(mockGenerateMarkdownLink).toHaveBeenCalledWith(expect.objectContaining({ linkPathStyle: 'RelativePathToTheSource' }));
    });

    it('should drop the alias when display text equals the old link path', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('folder/img.png'));
      mockGetFileOrNull.mockReturnValue(createFile('folder/img.png'));
      mockGenerateMarkdownLink.mockReturnValue('[[folder/img.png]]');
      const note = createFile('folder/note.md', 'md', { path: 'folder' });
      const link = createRef({ displayText: 'img.png', original: '[[folder/img.png]]' });
      asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md' });
      expect(mockGenerateMarkdownLink).toHaveBeenCalledWith(expect.objectContaining({ alias: undefined }));
    });

    it('should use the path change map to resolve the new link path', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'old.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('old.png'));
      mockGetFileOrNull.mockReturnValue(createFile('new.png'));
      mockGenerateMarkdownLink.mockReturnValue('[[new.png]]');
      const note = createFile('note.md');
      const link = createRef({ original: '[[old.png]]' });
      const pathChangeMap = new Map([['old.png', 'new.png']]);
      const result = asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md', pathChangeMap });
      expect(result).toBe('[[new.png]]');
    });

    it('should fall back to joining when extractLinkFile returns null without a map', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(null);
      mockGetFileOrNull.mockReturnValueOnce(null).mockReturnValueOnce(createFile('note/img.png'));
      mockGenerateMarkdownLink.mockReturnValue('[[img.png]]');
      const note = createFile('note.md', 'md', { path: '' });
      const link = createRef({ original: '[[img.png]]' });
      const result = asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md' });
      expect(result).toBe('[[img.png]]');
    });

    it('should default note.parent path to empty when computing the alias', () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockExtractLinkFile.mockReturnValue(createFile('img.png'));
      mockGetFileOrNull.mockReturnValue(createFile('img.png'));
      mockGenerateMarkdownLink.mockReturnValue('[[img.png]]');
      const note = createFile('note.md', 'md', null);
      const link = createRef({ displayText: 'caption', original: '[[img.png]]' });
      asPrivate(handler).convertLink({ link, note, oldNotePath: 'note.md' });
      expect(mockGenerateMarkdownLink).toHaveBeenCalledWith(expect.objectContaining({ alias: 'caption' }));
    });
  });
});

describe('ConsistencyCheckResult', () => {
  let app: App;

  beforeEach(() => {
    vi.clearAllMocks();
    app = strictProxy<App>({});
  });

  it('should add references grouped by note path', () => {
    const result = new ConsistencyCheckResult('Title');
    const link = createReferenceCache();
    result.add('note.md', link);
    result.add('note.md', createReferenceCache({ link: 'b' }));
    expect(result.get('note.md')).toHaveLength(2);
  });

  it('should report no problems found when empty', () => {
    const result = new ConsistencyCheckResult('My Title');
    expect(result.toString(castTo<App>(app), 'report.md')).toBe('# My Title\nNo problems found\n\n');
  });

  it('should skip notes that cannot be resolved to a file', () => {
    const result = new ConsistencyCheckResult('Title');
    result.add('missing.md', createReferenceCache());
    mockGetFileOrNull.mockReturnValue(null);
    expect(result.toString(castTo<App>(app), 'report.md')).toContain('Title (1 files)');
  });

  it('should render reference cache and frontmatter link entries', () => {
    const result = new ConsistencyCheckResult('Title');
    const refLink = createReferenceCache({ link: 'a', original: '[[a]]' });
    const fmLink = createReferenceCache({ key: 'prop', link: 'b', original: 'b' });
    result.add('note.md', refLink);
    result.add('note.md', fmLink);
    mockGetFileOrNull.mockReturnValue(createFile('note.md'));
    mockGenerateMarkdownLink.mockReturnValue('[[note]]');
    mockIsReferenceCache.mockImplementation((link: Reference) => link === refLink);
    mockIsFrontmatterLinkCache.mockImplementation((link: Reference) => link === fmLink);
    const str = result.toString(castTo<App>(app), 'report.md');
    expect(str).toContain('(line 1): `a`');
    expect(str).toContain('(key prop): `b`');
  });

  it('should ignore entries that are neither reference nor frontmatter caches', () => {
    const result = new ConsistencyCheckResult('Title');
    const link = createReferenceCache({ link: 'a' });
    result.add('note.md', link);
    mockGetFileOrNull.mockReturnValue(createFile('note.md'));
    mockGenerateMarkdownLink.mockReturnValue('[[note]]');
    mockIsReferenceCache.mockReturnValue(false);
    mockIsFrontmatterLinkCache.mockReturnValue(false);
    const str = result.toString(castTo<App>(app), 'report.md');
    expect(str).toContain('[[note]]:');
  });

  it('should not push when the array is missing in add', () => {
    const result = new ConsistencyCheckResult('Title');
    result.add('note.md', createReferenceCache());
    expect(result.has('note.md')).toBe(true);
  });

  it('should default to an empty array when a note key has no entries', () => {
    const result = new ConsistencyCheckResult('Title');
    result.set('note.md', []);
    mockGetFileOrNull.mockReturnValue(createFile('note.md'));
    mockGenerateMarkdownLink.mockReturnValue('[[note]]');
    const str = result.toString(castTo<App>(app), 'report.md');
    expect(str).toContain('[[note]]:');
  });
});
