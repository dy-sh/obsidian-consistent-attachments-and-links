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
import { noopAsync } from 'obsidian-dev-utils/function';
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

import type {
  MisplacedAttachmentCheckResult,
  MisplacedAttachmentHandler
} from './misplaced-attachment-handler.ts';
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
  resolveValidReferenceTarget(link: Reference, notePath: string): Promise<null | TFile>;
}

interface MisplacedParams {
  readonly misplacedAttachmentHandler: MisplacedAttachmentHandler;
  readonly misplacedAttachments: MisplacedAttachmentCheckResult;
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

/**
 * A stand-in misplaced-attachment check plus the bucket it fills. The real judgement has its own suite in
 * `misplaced-attachment-handler.test.ts`; what matters here is WHICH references reach it.
 */
function createMisplacedParams(): MisplacedParams {
  return {
    misplacedAttachmentHandler: strictProxy<MisplacedAttachmentHandler>({
      check: vi.fn((): Promise<void> => noopAsync())
    }),
    misplacedAttachments: castTo<MisplacedAttachmentCheckResult>(new Map())
  };
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
        ...createMisplacedParams(),
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
        ...createMisplacedParams(),
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
        ...createMisplacedParams(),
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
        ...createMisplacedParams(),
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
        ...createMisplacedParams(),
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
        ...createMisplacedParams(),
        note: createFile('note.md')
      });
      expect(badLinks.size).toBe(0);
    });

    it('should offer every reference that RESOLVED to the misplaced-attachment check, across all three kinds', async () => {
      const link = createReferenceCache({ link: 'good', original: '[good](good)' });
      const embed = createReferenceCache({ link: 'good-embed', original: '![[good-embed]]' });
      const fmLink = createReferenceCache({ key: 'prop', link: 'good-fm', original: 'good-fm' });
      const target = createFile('good.md');
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [embed],
        frontmatterLinks: [fmLink],
        links: [link]
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'good', subpath: '' });
      mockGetFileOrNull.mockReturnValue(target);

      const misplacedParams = createMisplacedParams();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks: createResult(),
        ...misplacedParams,
        note: createFile('note.md')
      });

      const check = vi.mocked(misplacedParams.misplacedAttachmentHandler.check);
      expect(check).toHaveBeenCalledTimes(3);
      expect(check.mock.calls.map(([callParams]) => callParams.reference)).toEqual([link, embed, fmLink]);
      expect(check).toHaveBeenCalledWith(expect.objectContaining({
        attachmentFile: target,
        misplacedAttachments: misplacedParams.misplacedAttachments,
        notePath: 'note.md'
      }));
    });

    // The whole point of resolving once: a reference the report has already called bad must never reach the
    // Misplaced-attachment section too.
    it('should NOT offer a reference that failed to resolve to the misplaced-attachment check', async () => {
      const link = createReferenceCache({ link: 'bad', original: '[[bad]]' });
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({
        embeds: [],
        frontmatterLinks: [],
        links: [link]
      }));
      mockSplitSubpath.mockReturnValue({ linkPath: 'bad', subpath: '' });
      mockGetFileOrNull.mockReturnValue(null);

      const misplacedParams = createMisplacedParams();
      const badLinks = createResult();
      await handler.checkConsistency({
        badEmbeds: createResult(),
        badFrontmatterLinks: createResult(),
        badLinks,
        ...misplacedParams,
        note: createFile('note.md')
      });

      expect(badLinks.get('note.md')).toEqual([link]);
      expect(misplacedParams.misplacedAttachmentHandler.check).not.toHaveBeenCalled();
    });
  });

  // The resolution half of the old `isValidLink`. It now returns the resolved file rather than a boolean,
  // Because the misplaced-attachment check needs the very file the reference reached — so every case below
  // Asserts the IDENTITY of what came back, not merely that something did.
  describe('resolveValidReferenceTarget', () => {
    it('should resolve to the note itself when linkPath is empty', async () => {
      const note = createFile('note.md');
      mockSplitSubpath.mockReturnValue({ linkPath: '', subpath: '' });
      mockGetFileOrNull.mockReturnValue(note);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBe(note);
    });

    it('should normalize an absolute linkPath', async () => {
      const target = createFile('abs/img.png');
      mockSplitSubpath.mockReturnValue({ linkPath: '/abs/img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(target);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBe(target);
      expect(mockNormalizePath).toHaveBeenCalledWith('/abs/img.png');
    });

    it('should join a relative linkPath with the note dir', async () => {
      const target = createFile('folder/img.png');
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(target);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'folder/note.md')).toBe(target);
    });

    it('should return null when the file does not exist', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(null);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBeNull();
    });

    it('should return the file when there is no subpath', async () => {
      const target = createFile('img.png');
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '' });
      mockGetFileOrNull.mockReturnValue(target);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBe(target);
    });

    it('should accept #page= subpath for a pdf', async () => {
      const target = createFile('doc.pdf', 'PDF');
      mockSplitSubpath.mockReturnValue({ linkPath: 'doc.pdf', subpath: '#page=2' });
      mockGetFileOrNull.mockReturnValue(target);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBe(target);
    });

    it('should reject non-page subpath for a pdf', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'doc.pdf', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(createFile('doc.pdf', 'pdf'));
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBeNull();
    });

    it('should return null when subpath used on a non-markdown, non-pdf file', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'img.png', subpath: '#x' });
      mockGetFileOrNull.mockReturnValue(createFile('img.png', 'png'));
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBeNull();
    });

    it('should return null when the markdown file has no cache', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(createFile('other.md', 'md'));
      mockGetCacheSafe.mockResolvedValue(null);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBeNull();
    });

    it('should return the file when the subpath resolves in the markdown cache', async () => {
      const target = createFile('other.md', 'md');
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#heading' });
      mockGetFileOrNull.mockReturnValue(target);
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockResolveSubpath.mockReturnValue(strictProxy<ReturnType<typeof resolveSubpath>>({}));
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBe(target);
    });

    it('should return null when the subpath does not resolve in the markdown cache', async () => {
      mockSplitSubpath.mockReturnValue({ linkPath: 'other.md', subpath: '#missing' });
      mockGetFileOrNull.mockReturnValue(createFile('other.md', 'md'));
      mockGetCacheSafe.mockResolvedValue(castTo<Awaited<ReturnType<typeof getCacheSafe>>>({}));
      mockResolveSubpath.mockReturnValue(null);
      expect(await asPrivate(handler).resolveValidReferenceTarget(createRef(), 'note.md')).toBeNull();
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
