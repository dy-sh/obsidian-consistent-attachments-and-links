import { Platform } from 'obsidian';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import type { PathCompatibilityViolation } from './path-compatibility.ts';

import {
  findPathCompatibilityViolations,
  getCurrentPathCompatibilityPlatform,
  measure,
  PathCompatibilityPlatform,
  PathCompatibilityViolationType,
  repairName
} from './path-compatibility.ts';

// A 3-byte character in UTF-8, and 1 UTF-16 unit — the case a character count gets wrong.
const CJK = '文';

// A 4-byte character in UTF-8, and a SURROGATE PAIR in UTF-16 — the case a naive `slice` splits.
const EMOJI = '😀';

const ALL_PLATFORMS = [
  PathCompatibilityPlatform.Android,
  PathCompatibilityPlatform.Ios,
  PathCompatibilityPlatform.Linux,
  PathCompatibilityPlatform.MacOs,
  PathCompatibilityPlatform.Windows
];

const originalPlatform = { ...Platform };

function hasViolation(violations: readonly PathCompatibilityViolation[], platform: PathCompatibilityPlatform, type: PathCompatibilityViolationType): boolean {
  return violations.some((violation) => violation.platform === platform && violation.type === type);
}

function setPlatform(overrides: Partial<typeof Platform>): void {
  Object.assign(Platform, {
    isAndroidApp: false,
    isIosApp: false,
    isLinux: false,
    isMacOS: false,
    isWin: false,
    ...overrides
  });
}

describe('path-compatibility', () => {
  afterEach(() => {
    Object.assign(Platform, originalPlatform);
  });

  describe('measure', () => {
    it('should count UTF-16 units when not measuring in bytes', () => {
      expect(measure(CJK.repeat(10), false)).toBe(10);
      expect(measure(EMOJI.repeat(10), false)).toBe(20);
    });

    it('should count UTF-8 bytes when measuring in bytes', () => {
      expect(measure(CJK.repeat(10), true)).toBe(30);
      expect(measure(EMOJI.repeat(10), true)).toBe(40);
      expect(measure('abc', true)).toBe(3);
    });
  });

  describe('getCurrentPathCompatibilityPlatform', () => {
    it('should answer Windows', () => {
      setPlatform({ isWin: true });
      expect(getCurrentPathCompatibilityPlatform()).toBe(PathCompatibilityPlatform.Windows);
    });

    it('should answer Android', () => {
      setPlatform({ isAndroidApp: true });
      expect(getCurrentPathCompatibilityPlatform()).toBe(PathCompatibilityPlatform.Android);
    });

    it('should answer iOS', () => {
      setPlatform({ isIosApp: true });
      expect(getCurrentPathCompatibilityPlatform()).toBe(PathCompatibilityPlatform.Ios);
    });

    it('should answer macOS', () => {
      setPlatform({ isMacOS: true });
      expect(getCurrentPathCompatibilityPlatform()).toBe(PathCompatibilityPlatform.MacOs);
    });

    it('should answer Linux', () => {
      setPlatform({ isLinux: true });
      expect(getCurrentPathCompatibilityPlatform()).toBe(PathCompatibilityPlatform.Linux);
    });

    it('should answer null on a platform with no profile', () => {
      setPlatform({});
      expect(getCurrentPathCompatibilityPlatform()).toBeNull();
    });
  });

  describe('findPathCompatibilityViolations', () => {
    it('should find nothing when no platform is enabled', () => {
      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: `${'a'.repeat(500)}.md`,
        platforms: []
      })).toEqual([]);
    });

    it('should find nothing for an ordinary path', () => {
      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 40,
        path: 'notes/ordinary note.md',
        platforms: ALL_PLATFORMS
      })).toEqual([]);
    });

    // 10 + 1 + 249 = 260, one over Windows' 259.
    it('should report a file path one character over Windows budget', () => {
      const violations = findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: `${'a'.repeat(246)}.md`,
        platforms: [PathCompatibilityPlatform.Windows]
      });

      expect(hasViolation(violations, PathCompatibilityPlatform.Windows, PathCompatibilityViolationType.PathTooLong)).toBe(true);
    });

    it('should accept a file path exactly at Windows budget', () => {
      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: `${'a'.repeat(245)}.md`,
        platforms: [PathCompatibilityPlatform.Windows]
      })).toEqual([]);
    });

    // A folder gets 247 rather than 259, which is what leaves room for a name inside it.
    it('should hold a folder to the shorter Windows budget', () => {
      const path = 'a'.repeat(240);

      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path,
        platforms: [PathCompatibilityPlatform.Windows]
      })).toEqual([]);

      expect(hasViolation(
        findPathCompatibilityViolations({ isFolder: true, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Windows] }),
        PathCompatibilityPlatform.Windows,
        PathCompatibilityViolationType.PathTooLong
      )).toBe(true);
    });

    // 86 CJK characters are 258 bytes: over ext4's 255, and nowhere near any limit Windows has.
    it('should report a name that is too long in bytes but not in characters', () => {
      const path = CJK.repeat(86);

      expect(hasViolation(
        findPathCompatibilityViolations({ isFolder: false, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Android] }),
        PathCompatibilityPlatform.Android,
        PathCompatibilityViolationType.NameTooLong
      )).toBe(true);

      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path,
        platforms: [PathCompatibilityPlatform.Windows]
      })).toEqual([]);
    });

    it('should report a Windows-forbidden character only on Windows', () => {
      const path = 'notes/report<draft>.md';

      expect(hasViolation(
        findPathCompatibilityViolations({ isFolder: false, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Windows] }),
        PathCompatibilityPlatform.Windows,
        PathCompatibilityViolationType.ForbiddenCharacter
      )).toBe(true);

      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path,
        platforms: [PathCompatibilityPlatform.Linux]
      })).toEqual([]);
    });

    it('should report an Obsidian-unsafe character on every platform', () => {
      for (const platform of ALL_PLATFORMS) {
        expect(hasViolation(
          findPathCompatibilityViolations({ isFolder: false, maxVaultRootPathLength: 10, path: 'notes/a#b.md', platforms: [platform] }),
          platform,
          PathCompatibilityViolationType.ForbiddenCharacter
        )).toBe(true);
      }
    });

    it('should report a reserved name, with or without an extension, only on Windows', () => {
      for (const path of ['CON', 'con.md', 'notes/COM1.md', 'LPT9.txt']) {
        expect(hasViolation(
          findPathCompatibilityViolations({ isFolder: false, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Windows] }),
          PathCompatibilityPlatform.Windows,
          PathCompatibilityViolationType.ReservedName
        )).toBe(true);

        expect(findPathCompatibilityViolations({
          isFolder: false,
          maxVaultRootPathLength: 10,
          path,
          platforms: [PathCompatibilityPlatform.Android]
        })).toEqual([]);
      }
    });

    // Windows strips trailing dots and spaces before deciding, so this spelling is reserved too.
    it('should report a reserved name that carries a trailing space or dot', () => {
      for (const path of ['CON ', 'CON.', 'nul. ']) {
        expect(hasViolation(
          findPathCompatibilityViolations({ isFolder: true, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Windows] }),
          PathCompatibilityPlatform.Windows,
          PathCompatibilityViolationType.ReservedName
        )).toBe(true);
      }
    });

    it('should not report a name that merely starts with a reserved word', () => {
      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: 'contract.md',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toEqual([]);
    });

    it('should report a trailing dot or space only on Windows', () => {
      for (const path of ['notes/draft ', 'notes/draft.']) {
        expect(hasViolation(
          findPathCompatibilityViolations({ isFolder: true, maxVaultRootPathLength: 10, path, platforms: [PathCompatibilityPlatform.Windows] }),
          PathCompatibilityPlatform.Windows,
          PathCompatibilityViolationType.TrailingCharacter
        )).toBe(true);

        expect(findPathCompatibilityViolations({
          isFolder: true,
          maxVaultRootPathLength: 10,
          path,
          platforms: [PathCompatibilityPlatform.Linux]
        })).toEqual([]);
      }
    });

    it('should report each enabled platform separately', () => {
      const violations = findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: `${CJK.repeat(120)}<x>.md`,
        platforms: [PathCompatibilityPlatform.Android, PathCompatibilityPlatform.Windows]
      });

      expect(hasViolation(violations, PathCompatibilityPlatform.Android, PathCompatibilityViolationType.NameTooLong)).toBe(true);
      expect(hasViolation(violations, PathCompatibilityPlatform.Windows, PathCompatibilityViolationType.ForbiddenCharacter)).toBe(true);
      expect(hasViolation(violations, PathCompatibilityPlatform.Android, PathCompatibilityViolationType.ForbiddenCharacter)).toBe(false);
    });

    // The vault root is part of every path, so raising the budget is what makes an over-long path fit.
    it('should measure the vault root as part of the path', () => {
      const path = `${'a'.repeat(240)}.md`;

      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path,
        platforms: [PathCompatibilityPlatform.Windows]
      })).toEqual([]);

      expect(hasViolation(
        findPathCompatibilityViolations({ isFolder: false, maxVaultRootPathLength: 100, path, platforms: [PathCompatibilityPlatform.Windows] }),
        PathCompatibilityPlatform.Windows,
        PathCompatibilityViolationType.PathTooLong
      )).toBe(true);
    });
  });

  describe('repairName', () => {
    it('should return the name unchanged when no platform is enabled', () => {
      expect(repairName({
        basename: `CON<x> ${'a'.repeat(400)}`,
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: []
      })).toBe(`CON<x> ${'a'.repeat(400)}.md`);
    });

    it('should return a valid name unchanged', () => {
      expect(repairName({
        basename: 'ordinary note',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: 'notes',
        platforms: ALL_PLATFORMS
      })).toBe('ordinary note.md');
    });

    it('should replace forbidden characters one for one', () => {
      expect(repairName({
        basename: 'a<b>c:d',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBe('a-b-c-d.md');
    });

    it('should replace a forbidden character in the extension too', () => {
      expect(repairName({
        basename: 'note',
        extension: 'm|d',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBe('note.m-d');
    });

    it('should de-reserve a reserved name on Windows and leave it alone elsewhere', () => {
      const params = {
        basename: 'CON',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: ''
      };

      expect(repairName({ ...params, platforms: [PathCompatibilityPlatform.Windows] })).toBe('CON_.md');
      expect(repairName({ ...params, platforms: [PathCompatibilityPlatform.Android] })).toBe('CON.md');
    });

    // Trimming after the reserved-name test would turn an accepted `CON ` into a rejected `CON`.
    it('should de-reserve a name whose trailing space was hiding the reserved word', () => {
      expect(repairName({
        basename: 'CON ',
        extension: '',
        isFolder: true,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBe('CON_');
    });

    /*
     * The report has always called folder `CON.x` reserved; before the rules moved into the library the
     * repair disagreed and left it alone, because it tested the extension-less basename verbatim. Sharing
     * one predicate settles it. `CON.x.md` stays accepted on both sides — only the LAST extension is
     * dropped, so what is tested there is `CON.x`, not `CON`.
     */
    it('should de-reserve an extension-less name whose second segment was hiding the reserved word', () => {
      const params = {
        basename: 'CON.x',
        isFolder: true,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      };

      expect(repairName({ ...params, extension: '' })).toBe('CON.x_');
      expect(repairName({ ...params, extension: 'md', isFolder: false })).toBe('CON.x.md');
    });

    it('should trim trailing dots and spaces from the basename', () => {
      expect(repairName({
        basename: 'draft. ',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBe('draft.md');
    });

    // `note.md ` parses as basename `note` + extension `md `, so only trimming the basename misses it.
    it('should trim a trailing space from the extension', () => {
      expect(repairName({
        basename: 'note',
        extension: 'md ',
        isFolder: false,
        maxVaultRootPathLength: 40,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBe('note.md');
    });

    it('should truncate the basename and keep the extension whole', () => {
      const repaired = repairName({
        basename: 'a'.repeat(400),
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 200,
        parentPath: 'folder',
        platforms: [PathCompatibilityPlatform.Windows]
      });

      // 200 + 1 + len('folder/') + len(name) <= 259, so the whole name fits in 51 characters.
      expect(repaired).toBe(`${'a'.repeat(48)}.md`);
    });

    // 3n + len('.md') <= 255 gives n = 84 — a character count would have allowed 252 and produced a name
    // Every Android device rejects.
    it('should truncate by bytes where the platform counts bytes', () => {
      expect(repairName({
        basename: CJK.repeat(100),
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Android]
      })).toBe(`${CJK.repeat(84)}.md`);
    });

    it('should never split a surrogate pair', () => {
      const repaired = repairName({
        basename: EMOJI.repeat(100),
        extension: '',
        isFolder: true,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Android]
      });

      expect(repaired).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Counting code points is the assertion: a split surrogate pair would show up here as 126 halves.
      expect([...(repaired ?? '')]).toHaveLength(63);
      expect(repaired).toBe(EMOJI.repeat(63));
    });

    it('should satisfy every enabled platform at once', () => {
      const repaired = repairName({
        basename: `${CJK.repeat(200)}<x>`,
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Android, PathCompatibilityPlatform.Windows]
      });

      expect(repaired).not.toBeNull();
      expect(findPathCompatibilityViolations({
        isFolder: false,
        maxVaultRootPathLength: 10,
        path: repaired ?? '',
        platforms: [PathCompatibilityPlatform.Android, PathCompatibilityPlatform.Windows]
      })).toEqual([]);
    });

    it('should answer null when no name survives the path budget', () => {
      expect(repairName({
        basename: 'anything',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 258,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBeNull();
    });

    // Truncation can expose trailing dots that were harmless in the middle of the name, and trimming those
    // Can empty it — at which point there is nothing left to shorten.
    it('should answer null when truncation exposes trailing dots that empty the name', () => {
      expect(repairName({
        basename: '..a',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 253,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBeNull();
    });

    it('should answer null when the whole basename is trailing dots', () => {
      expect(repairName({
        basename: '...',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBeNull();
    });

    it('should answer null for an empty basename', () => {
      expect(repairName({
        basename: '',
        extension: 'md',
        isFolder: false,
        maxVaultRootPathLength: 10,
        parentPath: '',
        platforms: [PathCompatibilityPlatform.Windows]
      })).toBeNull();
    });
  });
});
