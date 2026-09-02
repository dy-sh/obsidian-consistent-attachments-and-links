import type {
  App,
  FrontmatterLinkCache,
  Reference,
  ReferenceCache,
  TFile
} from 'obsidian';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  normalizePath,
  resolveSubpath
} from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getFileOrNull } from 'obsidian-dev-utils/obsidian/file-system';
import {
  generateMarkdownLink,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
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

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/file-system')>(),
  getFileOrNull: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/link', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/link')>(),
  generateMarkdownLink: vi.fn(),
  splitSubpath: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getBacklinksForFileSafe: vi.fn(),
  getCacheSafe: vi.fn(),
  getLinks: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  ConsistencyCheckResult,
  LinksHandler
} from './links-handler.ts';

interface LinksHandlerPrivate {
  isValidLink(link: Reference, notePath: string): Promise<boolean>;
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
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockGenerateMarkdownLink = vi.mocked(generateMarkdownLink);
const mockSplitSubpath = vi.mocked(splitSubpath);
const mockGetCacheSafe = vi.mocked(getCacheSafe);

function asPrivate(handler: LinksHandler): LinksHandlerPrivate {
  return castTo<LinksHandlerPrivate>(handler);
}

function createFile(path: string, extension = 'md', parent?: null | ParentLike): TFile {
  return strictProxy<TFile>({
    extension,
    parent: parent === null ? null : strictProxy<TFile['parent']>(parent ?? { path: '' }),
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
  let handler: LinksHandler;
  let pluginSettingsComponent: PluginSettingsComponent;
  let settings: SettingsLike;

  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      isPathIgnored: vi.fn().mockReturnValue(false)
    };
    app = strictProxy<App>({});
    pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
      settings: castTo<PluginSettingsComponent['settings']>(settings)
    });
    handler = new LinksHandler({
      app,
      pluginSettingsComponent
    });
    mockNormalizePath.mockImplementation((p: string) => p.replace(/^\//, ''));
  });

  describe('checkConsistency', () => {
    function createResult(): ConsistencyCheckResult {
      return new ConsistencyCheckResult('title');
    }

    it('should return early when the note path is ignored', async () => {
      castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
      const badLinks = createResult();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks,
        note: createFile('note.md')
      });
      expect(badLinks.size).toBe(0);
    });

    it('should return early when there is no cache', async () => {
      mockGetCacheSafe.mockResolvedValue(null);
      const badLinks = createResult();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks,
        note: createFile('note.md')
      });
      expect(badLinks.size).toBe(0);
    });

    it('should record bad links, embeds and frontmatter links', async () => {
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

      const badLinks = createResult();
      const badEmbeds = createResult();
      const badFrontmatterLinks = createResult();
      await handler.checkConsistency({
        badEmbeds,
        badFrontmatterLinks,
        badLinks,
        note: createFile('note.md')
      });

      expect(badLinks.get('note.md')).toEqual([link]);
      expect(badEmbeds.get('note.md')).toEqual([embed]);
      expect(badFrontmatterLinks.get('note.md')).toEqual([fmLink]);
    });

    it('should not record valid links', async () => {
      const link = createReferenceCache({ link: 'good', original: '[good](good)' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [],
        frontmatterLinks: [],
        links: [link]
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'good', subpath: '' });
      mockGetFileOrNull.mockReturnValue(createFile('good.md'));

      const badLinks = createResult();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks,
        note: createFile('note.md')
      });
      expect(badLinks.size).toBe(0);
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

      const badEmbeds = createResult();
      const badFrontmatterLinks = createResult();
      await handler.checkConsistency({
        badEmbeds,
        badFrontmatterLinks,
        badLinks: createResult(),
        note: createFile('note.md')
      });
      expect(badEmbeds.size).toBe(0);
      expect(badFrontmatterLinks.size).toBe(0);
    });

    it('should default missing cache arrays to empty', async () => {
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      const badLinks = createResult();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks,
        note: createFile('note.md')
      });
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
    const $string = result.toString(castTo<App>(app), 'report.md');
    expect($string).toContain('(line 1): `a`');
    expect($string).toContain('(key prop): `b`');
  });

  it('should ignore entries that are neither reference nor frontmatter caches', () => {
    const result = new ConsistencyCheckResult('Title');
    const link = createReferenceCache({ link: 'a' });
    result.add('note.md', link);
    mockGetFileOrNull.mockReturnValue(createFile('note.md'));
    mockGenerateMarkdownLink.mockReturnValue('[[note]]');
    mockIsReferenceCache.mockReturnValue(false);
    mockIsFrontmatterLinkCache.mockReturnValue(false);
    const $string = result.toString(castTo<App>(app), 'report.md');
    expect($string).toContain('[[note]]:');
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
    const $string = result.toString(castTo<App>(app), 'report.md');
    expect($string).toContain('[[note]]:');
  });
});
