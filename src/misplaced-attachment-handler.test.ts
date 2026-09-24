import type {
  App,
  Reference,
  ReferenceCache,
  TFile
} from 'obsidian';

import {
  isFrontmatterLinkCache,
  isReferenceCache
} from '@obsidian-typings/obsidian-public-latest/implementations';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { getFileOrNull } from 'obsidian-dev-utils/obsidian/file-system';
import { initI18N } from 'obsidian-dev-utils/obsidian/i18n/i18n';
import { generateMarkdownLink } from 'obsidian-dev-utils/obsidian/link';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { AttachmentCollector } from './attachment-collector.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

const hoisted = vi.hoisted(() => ({
  insensitive: false
}));

interface CheckedInput {
  readonly attachmentFile: TFile;
  readonly reference: Reference;
}

interface DataAdapterExLike {
  insensitive: boolean;
}

// `parentFolderPath` is kept REAL: the vault-root answer (`/`, not `.`) is part of what these tests assert.
vi.mock('@obsidian-typings/obsidian-public-latest/implementations', async (importOriginal) => ({
  ...await importOriginal<typeof import('@obsidian-typings/obsidian-public-latest/implementations')>(),
  getDataAdapterEx: (): DataAdapterExLike => ({ insensitive: hoisted.insensitive }),
  isFrontmatterLinkCache: vi.fn(),
  isReferenceCache: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/file-system')>(),
  getFileOrNull: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/link', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/link')>(),
  generateMarkdownLink: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { translationsMap } from './i18n/locales/translations-map.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  MisplacedAttachmentCheckResult,
  MisplacedAttachmentHandler
} from './misplaced-attachment-handler.ts';

interface SettingsLike {
  isPathIgnored: (path: string) => boolean;
}

const mockIsFrontmatterLinkCache = vi.mocked(isFrontmatterLinkCache);
const mockIsReferenceCache = vi.mocked(isReferenceCache);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockGenerateMarkdownLink = vi.mocked(generateMarkdownLink);

function createFile(path: string): TFile {
  return strictProxy<TFile>({ path });
}

function createReferenceCache(line: number, link: string): Reference {
  return castTo<ReferenceCache>({
    displayText: '',
    link,
    original: `[[${link}]]`,
    position: {
      end: { col: 0, line, offset: 0 },
      start: { col: 0, line, offset: 0 }
    }
  });
}

describe('MisplacedAttachmentHandler', () => {
  let app: App;
  let attachmentCollector: AttachmentCollector;
  let handler: MisplacedAttachmentHandler;
  let misplacedAttachments: MisplacedAttachmentCheckResult;
  let settings: SettingsLike;

  beforeAll(async () => {
    await initI18N(translationsMap);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.insensitive = false;
    app = strictProxy<App>({});
    settings = {
      isPathIgnored: vi.fn().mockReturnValue(false)
    };
    attachmentCollector = strictProxy<AttachmentCollector>({
      getProperAttachmentPath: vi.fn((): Promise<null | string> => Promise.resolve(null)),
      isNoteEx: vi.fn((): boolean => false)
    });
    handler = new MisplacedAttachmentHandler({
      app,
      attachmentCollector,
      pluginSettingsComponent: strictProxy<PluginSettingsComponent>({
        settings: castTo<PluginSettingsComponent['settings']>(settings)
      })
    });
    misplacedAttachments = new MisplacedAttachmentCheckResult();
  });

  /**
   * Runs one judgement and hands back the exact objects it was given, so a caller can assert on identity
   * rather than on a matcher that would accept anything.
   */
  async function check(attachmentPath: string, notePath = 'note.md'): Promise<CheckedInput> {
    const attachmentFile = createFile(attachmentPath);
    const reference = createReferenceCache(0, attachmentPath);
    await handler.check({
      attachmentFile,
      misplacedAttachments,
      notePath,
      reference
    });
    return { attachmentFile, reference };
  }

  function whenProperPathIs(properPath: null | string): void {
    vi.mocked(attachmentCollector.getProperAttachmentPath).mockResolvedValue(properPath);
  }

  it('should record an attachment whose folder differs from the proper one', async () => {
    whenProperPathIs('Files/note/img.png');
    const { reference } = await check('attachments/img.png');

    expect(misplacedAttachments.get('note.md')).toStrictEqual([{
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference
    }]);
  });

  it('should ask for the proper path of the REAL attachment, against the referencing note', async () => {
    whenProperPathIs('Files/note/img.png');
    const { attachmentFile } = await check('attachments/img.png', 'folder/note.md');

    expect(attachmentCollector.getProperAttachmentPath).toHaveBeenCalledWith({
      attachmentFile,
      noteFilePath: 'folder/note.md'
    });
  });

  it('should skip a reference whose target is a note', async () => {
    vi.mocked(attachmentCollector.isNoteEx).mockReturnValue(true);
    whenProperPathIs('Files/note/other.md');
    await check('other.md');

    expect(misplacedAttachments.size).toBe(0);
    expect(attachmentCollector.getProperAttachmentPath).not.toHaveBeenCalled();
  });

  it('should skip an attachment whose path is ignored', async () => {
    castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
    whenProperPathIs('Files/note/img.png');
    await check('attachments/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(attachmentCollector.getProperAttachmentPath).not.toHaveBeenCalled();
  });

  it('should skip an attachment already at its proper path', async () => {
    whenProperPathIs(null);
    await check('Files/note/img.png');

    expect(misplacedAttachments.size).toBe(0);
  });

  // The judgement is about the FOLDER. An attachment sitting in the right folder under a name the rename
  // template would not produce is a different defect, and this plugin does not offer to fix it.
  it('should skip an attachment in the proper folder whose BASE NAME differs', async () => {
    whenProperPathIs('Files/note/note 2026-01-01.png');
    await check('Files/note/img.png');

    expect(misplacedAttachments.size).toBe(0);
  });

  // The vault root reads as `/`, Obsidian's own convention and what `getAttachmentFolderPath` returns —
  // never `.`, which `dirname` would have given and which reads as a literal folder name in the report.
  it('should name the vault root as the proper folder when that is where the attachment belongs', async () => {
    whenProperPathIs('img.png');
    await check('attachments/img.png');

    expect(misplacedAttachments.get('note.md')?.[0]?.properAttachmentFolderPath).toBe('/');
  });

  it('should skip an attachment already in the vault root when the root is its proper folder', async () => {
    whenProperPathIs('other.png');
    await check('img.png');

    expect(misplacedAttachments.size).toBe(0);
  });

  it('should NOT fold case when the data adapter is case-sensitive', async () => {
    hoisted.insensitive = false;
    whenProperPathIs('Files/Note/img.png');
    await check('files/note/img.png');

    expect(misplacedAttachments.size).toBe(1);
  });

  it('should fold case when the data adapter is case-insensitive', async () => {
    hoisted.insensitive = true;
    whenProperPathIs('Files/Note/img.png');
    await check('files/note/img.png');

    expect(misplacedAttachments.size).toBe(0);
  });

  it('should group several misplaced attachments under their note', async () => {
    whenProperPathIs('Files/note/a.png');
    await check('attachments/a.png');
    whenProperPathIs('Files/note/b.png');
    await check('attachments/b.png');

    expect(misplacedAttachments.get('note.md')).toHaveLength(2);
    expect(misplacedAttachments.size).toBe(1);
  });
});

describe('MisplacedAttachmentCheckResult', () => {
  let app: App;

  beforeAll(async () => {
    await initI18N(translationsMap);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = strictProxy<App>({});
    mockGenerateMarkdownLink.mockReturnValue('[[note]]');
    mockGetFileOrNull.mockReturnValue(createFile('note.md'));
    mockIsReferenceCache.mockReturnValue(false);
    mockIsFrontmatterLinkCache.mockReturnValue(false);
  });

  it('should say so when there is nothing to report', () => {
    const result = new MisplacedAttachmentCheckResult();
    expect(result.toString(app, 'report.md')).toBe('# Misplaced attachments\nNo problems found\n\n');
  });

  it('should name the line and both paths for a reference cache', () => {
    mockIsReferenceCache.mockReturnValue(true);
    const result = new MisplacedAttachmentCheckResult();
    result.add('note.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: createReferenceCache(4, 'attachments/img.png')
    });

    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (1 files)');
    expect(text).toContain('[[note]]:');
    expect(text).toContain('- (line 5): `attachments/img.png`');
    expect(text).toContain('  - Attachment `attachments/img.png` should be in `Files/note`');
  });

  it('should name the frontmatter key for a frontmatter link', () => {
    mockIsFrontmatterLinkCache.mockReturnValue(true);
    const result = new MisplacedAttachmentCheckResult();
    result.add('note.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: castTo<Reference>({ key: 'cover', link: 'attachments/img.png', original: 'attachments/img.png' })
    });

    expect(result.toString(app, 'report.md')).toContain('- (key cover): `attachments/img.png`');
  });

  it('should fall back to the bare link when the reference is neither kind', () => {
    const result = new MisplacedAttachmentCheckResult();
    result.add('note.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: castTo<Reference>({ link: 'attachments/img.png', original: 'attachments/img.png' })
    });

    expect(result.toString(app, 'report.md')).toContain('- `attachments/img.png`');
  });

  it('should skip a note that no longer exists', () => {
    mockGetFileOrNull.mockReturnValue(null);
    const result = new MisplacedAttachmentCheckResult();
    result.add('gone.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: castTo<Reference>({ link: 'attachments/img.png', original: 'attachments/img.png' })
    });

    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (1 files)');
    expect(text).not.toContain('attachments/img.png');
  });
});
