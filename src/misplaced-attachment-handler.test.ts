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
import {
  getAttachmentFilePath,
  isAtProperAttachmentPath
} from 'obsidian-dev-utils/obsidian/attachment-path';
import {
  getFileOrNull,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
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

vi.mock('obsidian-dev-utils/obsidian/attachment-path', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/attachment-path')>(),
  getAttachmentFilePath: vi.fn(),
  isAtProperAttachmentPath: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/file-system')>(),
  getFileOrNull: vi.fn(),
  isNote: vi.fn()
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
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { ExternalAttachmentLinkMode } from './plugin-settings.ts';

interface SettingsLike {
  externalAttachmentLinkMode: ExternalAttachmentLinkMode;
  isPathIgnored: (path: string) => boolean;
  isSharedAttachmentPath: (path: string) => boolean;
  isTreatedAsAttachment: (path: string) => boolean;
}

const mockIsFrontmatterLinkCache = vi.mocked(isFrontmatterLinkCache);
const mockIsReferenceCache = vi.mocked(isReferenceCache);
const mockGetAttachmentFilePath = vi.mocked(getAttachmentFilePath);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockIsAtProperAttachmentPath = vi.mocked(isAtProperAttachmentPath);
const mockIsNote = vi.mocked(isNote);
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

function toPath(pathOrFile: string | TFile): string {
  return typeof pathOrFile === 'string' ? pathOrFile : pathOrFile.path;
}

describe('MisplacedAttachmentHandler', () => {
  let app: App;
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
      externalAttachmentLinkMode: ExternalAttachmentLinkMode.Report,
      isPathIgnored: vi.fn().mockReturnValue(false),
      isSharedAttachmentPath: vi.fn().mockReturnValue(false),
      isTreatedAsAttachment: vi.fn().mockReturnValue(false)
    };
    mockIsNote.mockReturnValue(false);
    mockIsAtProperAttachmentPath.mockResolvedValue(false);
    handler = new MisplacedAttachmentHandler({
      app,
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

  /**
   * The owner's setup: each note is judged against its own folder under `./!!files/${noteFileName}`.
   */
  async function judgeAsNote(attachmentPath: string, noteName: string): Promise<void> {
    whenProperPathIs(`!!files/${noteName}/image.png`);
    await check(attachmentPath, `${noteName}.md`);
  }

  function whenProperPathIs(properPath: null | string): void {
    if (properPath === null) {
      mockIsAtProperAttachmentPath.mockResolvedValue(true);
      return;
    }
    mockIsAtProperAttachmentPath.mockResolvedValue(false);
    mockGetAttachmentFilePath.mockResolvedValue(properPath);
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

    expect(mockIsAtProperAttachmentPath).toHaveBeenCalledWith(expect.objectContaining({
      attachmentPathOrFile: attachmentFile,
      notePathOrFile: 'folder/note.md'
    }));
    // The duplicate check is skipped: a deduplicated name would never match a folder the attachment is not in.
    expect(mockGetAttachmentFilePath).toHaveBeenCalledWith(expect.objectContaining({
      notePathOrFile: 'folder/note.md',
      oldAttachmentPathOrFile: attachmentFile,
      shouldSkipDuplicateCheck: true
    }));
  });

  it('should skip a reference whose target is a note', async () => {
    mockIsNote.mockReturnValue(true);
    whenProperPathIs('Files/note/other.md');
    await check('other.md');

    expect(misplacedAttachments.size).toBe(0);
    expect(mockGetAttachmentFilePath).not.toHaveBeenCalled();
  });

  // A note whose extension the user declared an attachment's — `.excalidraw.md` by default — IS judged.
  it('should judge a note treated as an attachment', async () => {
    mockIsNote.mockReturnValue(true);
    castTo<ReturnType<typeof vi.fn>>(settings.isTreatedAsAttachment).mockReturnValue(true);
    whenProperPathIs('Files/note/drawing.excalidraw.md');
    await check('attachments/drawing.excalidraw.md');

    expect(misplacedAttachments.get('note.md')).toHaveLength(1);
  });

  it('should skip an attachment whose path is ignored', async () => {
    castTo<ReturnType<typeof vi.fn>>(settings.isPathIgnored).mockReturnValue(true);
    whenProperPathIs('Files/note/img.png');
    await check('attachments/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(mockGetAttachmentFilePath).not.toHaveBeenCalled();
  });

  it('should skip an attachment in a shared location, asked about the attachment\'s own path', async () => {
    castTo<ReturnType<typeof vi.fn>>(settings.isSharedAttachmentPath).mockImplementation((path: string) => path.startsWith('Shared/'));
    whenProperPathIs('Files/note/img.png');
    await check('Shared/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(settings.isSharedAttachmentPath).toHaveBeenCalledWith('Shared/img.png');
    expect(mockIsAtProperAttachmentPath).not.toHaveBeenCalled();

    await check('Elsewhere/img.png');
    expect(misplacedAttachments.get('note.md')).toHaveLength(1);
  });

  it('should ask nothing and record nothing when the mode is Ignore', async () => {
    settings.externalAttachmentLinkMode = ExternalAttachmentLinkMode.Ignore;
    whenProperPathIs('Files/note/img.png');
    await check('attachments/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(mockIsAtProperAttachmentPath).not.toHaveBeenCalled();
  });

  it('should skip an attachment already at its proper path, and make its note the proper note', async () => {
    whenProperPathIs(null);
    await check('Files/note/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(mockGetAttachmentFilePath).not.toHaveBeenCalled();
    expect(misplacedAttachments.isProperNote('Files/note/img.png', 'note.md')).toBe(true);
  });

  // The judgement is about the FOLDER. An attachment sitting in the right folder under a name the rename
  // template would not produce is a different defect, and this plugin does not offer to fix it.
  it('should skip an attachment in the proper folder whose BASE NAME differs', async () => {
    whenProperPathIs('Files/note/note 2026-01-01.png');
    await check('Files/note/img.png');

    expect(misplacedAttachments.size).toBe(0);
    expect(misplacedAttachments.isProperNote('Files/note/img.png', 'note.md')).toBe(true);
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

  /*
   * The owner's case: `./!!files/${noteFileName}`, and `A.md` embeds `!!files/B/image.png`. A's own folder is
   * `!!files/A`, so A links an external attachment — whether or not B uses it too.
   */
  it('should report an attachment filed in ANOTHER note\'s folder when only this note references it', async () => {
    await judgeAsNote('!!files/B/image.png', 'A');

    expect(misplacedAttachments.getReported().get('A.md')).toStrictEqual([expect.objectContaining({
      attachmentPath: '!!files/B/image.png',
      properAttachmentFolderPath: '!!files/A'
    })]);
    expect(misplacedAttachments.getOtherUserNotePaths('!!files/B/image.png', 'A.md')).toStrictEqual([]);
  });

  // The shared case, which 5.0.2 hid: B embeds it too and B's folder holds it. A is still reported, and B is
  // named as its proper note, whichever note is walked first.
  it('should report A and name B as the proper note when B uses it too, whichever note comes first', async () => {
    await judgeAsNote('!!files/B/image.png', 'A');
    await judgeAsNote('!!files/B/image.png', 'B');

    expect([...misplacedAttachments.getReported().keys()]).toStrictEqual(['A.md']);
    expect(misplacedAttachments.getOtherUserNotePaths('!!files/B/image.png', 'A.md')).toStrictEqual(['B.md']);
    expect(misplacedAttachments.isProperNote('!!files/B/image.png', 'B.md')).toBe(true);

    misplacedAttachments = new MisplacedAttachmentCheckResult();
    await judgeAsNote('!!files/B/image.png', 'B');
    await judgeAsNote('!!files/B/image.png', 'A');

    expect([...misplacedAttachments.getReported().keys()]).toStrictEqual(['A.md']);
    expect(misplacedAttachments.getOtherUserNotePaths('!!files/B/image.png', 'A.md')).toStrictEqual(['B.md']);
  });

  it('should list the proper note first, then the other users in walk order', async () => {
    await judgeAsNote('!!files/B/image.png', 'A');
    await judgeAsNote('!!files/B/image.png', 'C');
    await judgeAsNote('!!files/B/image.png', 'D');
    await judgeAsNote('!!files/B/image.png', 'B');

    expect(misplacedAttachments.getOtherUserNotePaths('!!files/B/image.png', 'A.md')).toStrictEqual(['B.md', 'C.md', 'D.md']);
    expect([...misplacedAttachments.getReported().keys()]).toStrictEqual(['A.md', 'C.md', 'D.md']);
  });

  it('should report nothing of an owned attachment under ReportUnowned, whichever note comes first', async () => {
    misplacedAttachments = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.ReportUnowned);
    await judgeAsNote('!!files/B/image.png', 'A');
    await judgeAsNote('!!files/B/image.png', 'B');

    expect(misplacedAttachments.getReported().size).toBe(0);

    misplacedAttachments = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.ReportUnowned);
    await judgeAsNote('!!files/B/image.png', 'B');
    await judgeAsNote('!!files/B/image.png', 'A');

    expect(misplacedAttachments.getReported().size).toBe(0);
  });

  // Owned by FOLDER is enough, the same standard the per-note judgement uses: a name the rename template would
  // not produce does not make B's folder any less B's.
  it('should count a note whose folder holds the attachment under another name as its proper note', async () => {
    misplacedAttachments = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.ReportUnowned);
    await judgeAsNote('!!files/B/image.png', 'A');
    whenProperPathIs('!!files/B/B 2026-01-01.png');
    await check('!!files/B/image.png', 'B.md');

    expect(misplacedAttachments.getReported().size).toBe(0);
  });

  // Shared, but in NO referencing note's folder: every reference is reported in both modes, each against its own
  // folder, and there is no proper note.
  it('should report every reference to a shared attachment that no referencing note\'s folder holds, in both modes', async () => {
    for (const mode of [ExternalAttachmentLinkMode.Report, ExternalAttachmentLinkMode.ReportUnowned]) {
      misplacedAttachments = new MisplacedAttachmentCheckResult(mode);
      await judgeAsNote('!!files/C/image.png', 'A');
      await judgeAsNote('!!files/C/image.png', 'B');

      const reported = misplacedAttachments.getReported();
      expect(reported.get('A.md')?.[0]?.properAttachmentFolderPath).toBe('!!files/A');
      expect(reported.get('B.md')?.[0]?.properAttachmentFolderPath).toBe('!!files/B');
      expect(misplacedAttachments.isProperNote('!!files/C/image.png', 'B.md')).toBe(false);
    }
  });

  it('should group several misplaced attachments under their note', async () => {
    whenProperPathIs('Files/note/a.png');
    await check('attachments/a.png');
    whenProperPathIs('Files/note/b.png');
    await check('attachments/b.png');

    expect(misplacedAttachments.get('note.md')).toHaveLength(2);
    expect(misplacedAttachments.size).toBe(1);
  });

  it('should name a note that references an attachment twice only once among the other users', async () => {
    await judgeAsNote('!!files/B/image.png', 'A');
    await judgeAsNote('!!files/B/image.png', 'C');
    await judgeAsNote('!!files/B/image.png', 'C');

    expect(misplacedAttachments.getOtherUserNotePaths('!!files/B/image.png', 'A.md')).toStrictEqual(['C.md']);
    expect(misplacedAttachments.get('C.md')).toHaveLength(2);
  });

  it('should know no users and no proper note of an attachment nobody referenced', () => {
    expect(misplacedAttachments.getOtherUserNotePaths('unused.png', 'A.md')).toStrictEqual([]);
    expect(misplacedAttachments.isProperNote('unused.png', 'A.md')).toBe(false);
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
    mockGenerateMarkdownLink.mockImplementation(({ targetPathOrFile }) => `[[${toPath(targetPathOrFile).replace(/\.md$/, '')}]]`);
    mockGetFileOrNull.mockImplementation(({ pathOrFile }) => pathOrFile ? createFile(toPath(pathOrFile)) : null);
    mockIsReferenceCache.mockReturnValue(false);
    mockIsFrontmatterLinkCache.mockReturnValue(false);
  });

  function addEntry(result: MisplacedAttachmentCheckResult, notePath: string, attachmentPath: string): void {
    result.add(notePath, {
      attachmentPath,
      properAttachmentFolderPath: `!!files/${notePath.replace(/\.md$/, '')}`,
      reference: createReferenceCache(0, attachmentPath)
    });
  }

  function whenMissing(missingPath: string): void {
    mockGetFileOrNull.mockImplementation(({ pathOrFile }) => !pathOrFile || toPath(pathOrFile) === missingPath ? null : createFile(toPath(pathOrFile)));
  }

  it('should say so when there is nothing to report', () => {
    const result = new MisplacedAttachmentCheckResult();
    expect(result.toString(app, 'report.md')).toBe('# Misplaced attachments\nNo problems found\n\n');
  });

  it('should say the section was skipped under Ignore, whatever it holds', () => {
    const result = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.Ignore);
    addEntry(result, 'A.md', '!!files/B/image.png');

    expect(result.getReported().size).toBe(0);
    expect(result.toString(app, 'report.md')).toBe(
      '# Misplaced attachments\nNot checked: \'Links to attachments outside the note\'s folder\' is set to \'Ignore\'.\n\n'
    );
  });

  it('should print the owner\'s line with no clause when nothing else uses the attachment', () => {
    mockIsReferenceCache.mockReturnValue(true);
    const result = new MisplacedAttachmentCheckResult();
    result.add('A.md', {
      attachmentPath: '!!files/B/image.png',
      properAttachmentFolderPath: '!!files/A',
      reference: createReferenceCache(4, '!!files/B/image.png')
    });

    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (1 files)');
    expect(text).toContain('- [[A]] links to external [[!!files/B/image.png]]\n');
    expect(text).toContain('  - (line 5): `!!files/B/image.png`\n');
    expect(text).toContain('  - This note\'s attachment folder is `!!files/A`\n');
    // The attachment is linked, never embedded, so the report does not render the image.
    expect(mockGenerateMarkdownLink).toHaveBeenCalledWith(expect.objectContaining({ isEmbed: false, targetPathOrFile: '!!files/B/image.png' }));
  });

  it('should mark the proper note in the clause', () => {
    const result = new MisplacedAttachmentCheckResult();
    addEntry(result, 'A.md', '!!files/B/image.png');
    result.markHomed('!!files/B/image.png', 'B.md');

    expect(result.toString(app, 'report.md')).toContain(
      '- [[A]] links to external [[!!files/B/image.png]] (also used by [[B]] (its proper note))\n'
    );
  });

  it('should name one other user when there is no proper note', () => {
    const result = new MisplacedAttachmentCheckResult();
    addEntry(result, 'A.md', '!!files/X/image.png');
    addEntry(result, 'C.md', '!!files/X/image.png');

    const text = result.toString(app, 'report.md');
    expect(text).toContain('- [[A]] links to external [[!!files/X/image.png]] (also used by [[C]])\n');
    expect(text).toContain('- [[C]] links to external [[!!files/X/image.png]] (also used by [[A]])\n');
  });

  it('should print the owner\'s full example: the proper note first, then every other user', () => {
    const result = new MisplacedAttachmentCheckResult();
    addEntry(result, 'A.md', '!!files/B/image.png');
    addEntry(result, 'C.md', '!!files/B/image.png');
    result.markHomed('!!files/B/image.png', 'B.md');
    addEntry(result, 'D.md', '!!files/B/image.png');

    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (3 files)');
    expect(text).toContain('- [[A]] links to external [[!!files/B/image.png]] (also used by [[B]] (its proper note), [[C]], [[D]])\n');
    expect(text).toContain('- [[D]] links to external [[!!files/B/image.png]] (also used by [[B]] (its proper note), [[A]], [[C]])\n');
    expect(text).not.toContain('- [[B]] links');
  });

  it('should name the frontmatter key for a frontmatter link', () => {
    mockIsFrontmatterLinkCache.mockReturnValue(true);
    const result = new MisplacedAttachmentCheckResult();
    result.add('note.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: castTo<Reference>({ key: 'cover', link: 'attachments/img.png', original: 'attachments/img.png' })
    });

    expect(result.toString(app, 'report.md')).toContain('  - (key cover): `attachments/img.png`');
  });

  it('should fall back to the bare link when the reference is neither kind', () => {
    const result = new MisplacedAttachmentCheckResult();
    result.add('note.md', {
      attachmentPath: 'attachments/img.png',
      properAttachmentFolderPath: 'Files/note',
      reference: castTo<Reference>({ link: 'attachments/img.png', original: 'attachments/img.png' })
    });

    expect(result.toString(app, 'report.md')).toContain('  - `attachments/img.png`');
  });

  it('should leave out an owned attachment under ReportUnowned, and a note with nothing left', () => {
    const result = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.ReportUnowned);
    addEntry(result, 'note.md', 'Files/other/shared.png');
    addEntry(result, 'note.md', 'attachments/img.png');
    addEntry(result, 'only-shared.md', 'Files/other/shared.png');
    result.markHomed('Files/other/shared.png', 'other.md');

    expect([...result.getReported().keys()]).toStrictEqual(['note.md']);
    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (1 files)');
    expect(text).toContain('attachments/img.png');
    expect(text).not.toContain('shared.png');
  });

  it('should keep an owned attachment under Report', () => {
    const result = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.Report);
    addEntry(result, 'note.md', 'Files/other/shared.png');
    result.markHomed('Files/other/shared.png', 'other.md');

    expect([...result.getReported().keys()]).toStrictEqual(['note.md']);
  });

  it('should say there is nothing to report when every candidate is owned under ReportUnowned', () => {
    const result = new MisplacedAttachmentCheckResult(ExternalAttachmentLinkMode.ReportUnowned);
    addEntry(result, 'note.md', 'Files/other/shared.png');
    result.markHomed('Files/other/shared.png', 'other.md');

    expect(result.toString(app, 'report.md')).toBe('# Misplaced attachments\nNo problems found\n\n');
  });

  it('should skip a note that no longer exists, in its own lines and in the clause', () => {
    whenMissing('gone.md');
    const result = new MisplacedAttachmentCheckResult();
    addEntry(result, 'gone.md', 'attachments/img.png');
    addEntry(result, 'A.md', 'attachments/img.png');

    const text = result.toString(app, 'report.md');
    expect(text).toContain('# Misplaced attachments (2 files)');
    expect(text).not.toContain('[[gone]]');
    expect(text).toContain('- [[A]] links to external [[attachments/img.png]]\n');
  });

  it('should print the attachment path as code when the attachment no longer exists', () => {
    whenMissing('attachments/img.png');
    const result = new MisplacedAttachmentCheckResult();
    addEntry(result, 'A.md', 'attachments/img.png');

    expect(result.toString(app, 'report.md')).toContain('- [[A]] links to external `attachments/img.png`\n');
  });
});
