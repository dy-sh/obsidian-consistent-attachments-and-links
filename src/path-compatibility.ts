/**
 * @file
 *
 * Which naming constraints each platform imposes, which of them a given path violates, and how to repair a
 * name so it satisfies every enabled platform at once.
 *
 * Pure by design — no `App`, no vault, no I/O — so the whole correctness surface (byte counting, extension
 * preservation, truncation order, profile composition) is unit-testable without an Obsidian instance. The
 * vault pass that consumes it is `path-compatibility-handler.ts`.
 *
 * A vault is synced, so the platform that matters is not necessarily the one running: enabling several
 * platforms composes their constraints by intersection, and a name has to satisfy all of them.
 */

import { Platform } from 'obsidian';
import {
  getOsUnsafePathCharsRegExp,
  OBSIDIAN_UNSAFE_FILENAME_CHARS
} from 'obsidian-dev-utils/obsidian/validation';

/**
 * A platform a vault may be synced to, and whose naming rules can therefore be enforced.
 */
export enum PathCompatibilityPlatform {
  Android = 'Android',
  Ios = 'Ios',
  Linux = 'Linux',
  MacOs = 'MacOs',
  Windows = 'Windows'
}

/**
 * What a single path or name is wrong about, on one platform.
 */
export enum PathCompatibilityViolationType {
  ForbiddenCharacter = 'ForbiddenCharacter',
  NameTooLong = 'NameTooLong',
  PathTooLong = 'PathTooLong',
  ReservedName = 'ReservedName',
  TrailingCharacter = 'TrailingCharacter'
}

/**
 * Parameters for {@link findPathCompatibilityViolations}.
 */
export interface FindPathCompatibilityViolationsParams {
  /**
   * Whether the path names a folder, which has its own path budget.
   */
  readonly isFolder: boolean;

  /**
   * The length of the longest vault root path the vault is expected to live under, in characters.
   *
   * The vault root of a platform the check is not running on is unknowable, so it is stated rather than
   * guessed — see the `maxVaultRootPathLength` setting.
   */
  readonly maxVaultRootPathLength: number;

  /**
   * The vault-relative path to check.
   */
  readonly path: string;

  /**
   * The platforms whose rules to enforce.
   */
  readonly platforms: readonly PathCompatibilityPlatform[];
}

/**
 * The naming rules of one platform.
 */
export interface PathCompatibilityProfile {
  /**
   * Whether this platform applies Windows' naming rules: its forbidden characters, its reserved device
   * names, and its rejection of trailing dots and spaces.
   *
   * One flag for three rules because they are one filesystem's rules, and no platform adopts a subset.
   */
  readonly hasWindowsNamingRules: boolean;

  /**
   * The longest absolute path a file may have, in this profile's unit.
   */
  readonly maxFilePathLength: number;

  /**
   * The longest absolute path a folder may have, in this profile's unit.
   *
   * Below {@link PathCompatibilityProfile.maxFilePathLength} on Windows, where the shorter budget leaves
   * room for an `8.3` name inside the folder.
   */
  readonly maxFolderPathLength: number;

  /**
   * The longest single name — one path segment — in this profile's unit.
   */
  readonly maxNameLength: number;

  /**
   * The platform this profile describes.
   */
  readonly platform: PathCompatibilityPlatform;

  /**
   * Whether lengths count UTF-8 bytes (ext4, APFS) rather than UTF-16 units (NTFS).
   *
   * This is the whole reason the 255 limit is not a character count: a name of 128 CJK characters is 384
   * bytes and is rejected by ext4 while being nowhere near any limit Windows has.
   */
  readonly shouldMeasureInBytes: boolean;
}

/**
 * One thing wrong with one path, and the platform that objects to it.
 */
export interface PathCompatibilityViolation {
  /**
   * The platform whose rules the path breaks. Another enabled platform may accept the very same path.
   */
  readonly platform: PathCompatibilityPlatform;

  /**
   * What is wrong.
   */
  readonly type: PathCompatibilityViolationType;
}

/**
 * Parameters for {@link repairName}.
 */
export interface RepairNameParams {
  /**
   * The name without its extension. For a folder, the whole name.
   */
  readonly basename: string;

  /**
   * The name's extension, without the leading dot. Empty for a folder or an extension-less file.
   */
  readonly extension: string;

  /**
   * Whether the name belongs to a folder.
   */
  readonly isFolder: boolean;

  /**
   * The length of the longest vault root path the vault is expected to live under, in characters.
   */
  readonly maxVaultRootPathLength: number;

  /**
   * The vault-relative path of the parent folder. Empty at the vault root.
   */
  readonly parentPath: string;

  /**
   * The platforms whose rules the repaired name must satisfy.
   */
  readonly platforms: readonly PathCompatibilityPlatform[];
}

/**
 * Every platform, in the order the settings tab and the consistency report list them: the ones whose limits
 * actually bind in practice first.
 */
export const PATH_COMPATIBILITY_PLATFORMS: readonly PathCompatibilityPlatform[] = [
  PathCompatibilityPlatform.Windows,
  PathCompatibilityPlatform.Android,
  PathCompatibilityPlatform.Linux,
  PathCompatibilityPlatform.MacOs,
  PathCompatibilityPlatform.Ios
];

/**
 * How each platform is named in the settings tab and the consistency report.
 *
 * Not translated: these are product names, and `macOS` is spelled `macOS` in every language.
 */
export const PATH_COMPATIBILITY_PLATFORM_LABELS: Record<PathCompatibilityPlatform, string> = {
  [PathCompatibilityPlatform.Android]: 'Android',
  [PathCompatibilityPlatform.Ios]: 'iOS',
  [PathCompatibilityPlatform.Linux]: 'Linux',
  [PathCompatibilityPlatform.MacOs]: 'macOS',
  [PathCompatibilityPlatform.Windows]: 'Windows'
};

/**
 * `MAX_PATH` is 260 including the terminating NUL, so 259 usable characters for a file.
 */
const WINDOWS_MAX_FILE_PATH_LENGTH = 259;

/**
 * A folder gets 12 fewer, leaving room for a `\` and an 8.3 name inside it.
 */
const WINDOWS_MAX_FOLDER_PATH_LENGTH = 247;

/**
 * NTFS's per-name cap, in UTF-16 units. Never the binding constraint: a path that fits in
 * {@link WINDOWS_MAX_FILE_PATH_LENGTH} characters contains no longer name.
 */
const WINDOWS_MAX_NAME_LENGTH = 255;

/**
 * Ext4 / f2fs / APFS all cap a single name at 255 BYTES. This is the limit a character count gets wrong.
 */
const UNIX_MAX_NAME_BYTES = 255;

/**
 * `PATH_MAX` on Linux and Android. So far above anything a vault produces that only the name limit binds.
 */
const LINUX_MAX_PATH_BYTES = 4096;

/**
 * `PATH_MAX` on macOS and iOS.
 */
const DARWIN_MAX_PATH_BYTES = 1024;

/**
 * The MS-DOS device names Windows still refuses as a file name, with or without an extension.
 *
 * `CONIN$` / `CONOUT$` and the superscript `COM²` forms are deliberately absent: they are accepted by every
 * Windows version that runs Obsidian, and matching them would rename files that work.
 */
const RESERVED_NAME_REG_EXP = /^(?:AUX|COM[1-9]|CON|LPT[1-9]|NUL|PRN)$/i;

const TRAILING_DOTS_AND_SPACES_REG_EXP = /[ .]+$/;

const PATH_COMPATIBILITY_PROFILES: Record<PathCompatibilityPlatform, PathCompatibilityProfile> = {
  [PathCompatibilityPlatform.Android]: {
    hasWindowsNamingRules: false,
    maxFilePathLength: LINUX_MAX_PATH_BYTES,
    maxFolderPathLength: LINUX_MAX_PATH_BYTES,
    maxNameLength: UNIX_MAX_NAME_BYTES,
    platform: PathCompatibilityPlatform.Android,
    shouldMeasureInBytes: true
  },

  [PathCompatibilityPlatform.Ios]: {
    hasWindowsNamingRules: false,
    maxFilePathLength: DARWIN_MAX_PATH_BYTES,
    maxFolderPathLength: DARWIN_MAX_PATH_BYTES,
    maxNameLength: UNIX_MAX_NAME_BYTES,
    platform: PathCompatibilityPlatform.Ios,
    shouldMeasureInBytes: true
  },

  [PathCompatibilityPlatform.Linux]: {
    hasWindowsNamingRules: false,
    maxFilePathLength: LINUX_MAX_PATH_BYTES,
    maxFolderPathLength: LINUX_MAX_PATH_BYTES,
    maxNameLength: UNIX_MAX_NAME_BYTES,
    platform: PathCompatibilityPlatform.Linux,
    shouldMeasureInBytes: true
  },

  [PathCompatibilityPlatform.MacOs]: {
    hasWindowsNamingRules: false,
    maxFilePathLength: DARWIN_MAX_PATH_BYTES,
    maxFolderPathLength: DARWIN_MAX_PATH_BYTES,
    maxNameLength: UNIX_MAX_NAME_BYTES,
    platform: PathCompatibilityPlatform.MacOs,
    shouldMeasureInBytes: true
  },

  [PathCompatibilityPlatform.Windows]: {
    hasWindowsNamingRules: true,
    maxFilePathLength: WINDOWS_MAX_FILE_PATH_LENGTH,
    maxFolderPathLength: WINDOWS_MAX_FOLDER_PATH_LENGTH,
    maxNameLength: WINDOWS_MAX_NAME_LENGTH,
    platform: PathCompatibilityPlatform.Windows,
    shouldMeasureInBytes: false
  }
};

/**
 * Finds everything wrong with a path, across every enabled platform.
 *
 * Read-only: this is what the consistency report renders, and it never proposes a repair.
 *
 * @param params - The path and the platforms to check it against.
 * @returns The violations, empty when the path is valid everywhere.
 */
export function findPathCompatibilityViolations(params: FindPathCompatibilityViolationsParams): PathCompatibilityViolation[] {
  const violations: PathCompatibilityViolation[] = [];
  const name = getName(params.path);

  for (const profile of getProfiles(params.platforms)) {
    const maxPathLength = params.isFolder ? profile.maxFolderPathLength : profile.maxFilePathLength;
    const fullPathLength = params.maxVaultRootPathLength + 1 + measure(params.path, profile.shouldMeasureInBytes);

    if (fullPathLength > maxPathLength) {
      violations.push({ platform: profile.platform, type: PathCompatibilityViolationType.PathTooLong });
    }

    if (measure(name, profile.shouldMeasureInBytes) > profile.maxNameLength) {
      violations.push({ platform: profile.platform, type: PathCompatibilityViolationType.NameTooLong });
    }

    if (replaceForbiddenCharacters(name, profile) !== name) {
      violations.push({ platform: profile.platform, type: PathCompatibilityViolationType.ForbiddenCharacter });
    }

    if (profile.hasWindowsNamingRules) {
      // Windows strips trailing dots and spaces before it decides, so `CON ` is every bit as reserved as
      // `CON` — checking the raw name would let exactly that spelling through.
      if (RESERVED_NAME_REG_EXP.test(getBasenameOfName(name.replace(TRAILING_DOTS_AND_SPACES_REG_EXP, '')))) {
        violations.push({ platform: profile.platform, type: PathCompatibilityViolationType.ReservedName });
      }

      if (TRAILING_DOTS_AND_SPACES_REG_EXP.test(name)) {
        violations.push({ platform: profile.platform, type: PathCompatibilityViolationType.TrailingCharacter });
      }
    }
  }

  return violations;
}

/**
 * The platform the plugin is running on, or `null` on a platform with no profile.
 *
 * Used only to seed the settings defaults, so that a fresh install reports on the vault in front of it
 * without the user configuring anything first.
 *
 * @returns The current platform, or `null`.
 */
export function getCurrentPathCompatibilityPlatform(): null | PathCompatibilityPlatform {
  if (Platform.isWin) {
    return PathCompatibilityPlatform.Windows;
  }

  if (Platform.isAndroidApp) {
    return PathCompatibilityPlatform.Android;
  }

  if (Platform.isIosApp) {
    return PathCompatibilityPlatform.Ios;
  }

  if (Platform.isMacOS) {
    return PathCompatibilityPlatform.MacOs;
  }

  if (Platform.isLinux) {
    return PathCompatibilityPlatform.Linux;
  }

  return null;
}

/**
 * Measures a string the way a filesystem does.
 *
 * @param $string - The string to measure.
 * @param shouldMeasureInBytes - Whether to count UTF-8 bytes rather than UTF-16 units.
 * @returns The length.
 */
export function measure($string: string, shouldMeasureInBytes: boolean): number {
  return shouldMeasureInBytes ? new Blob([$string]).size : $string.length;
}

/**
 * Repairs a name so that it satisfies every enabled platform.
 *
 * The order is deliberate: characters are replaced and a reserved name de-reserved BEFORE anything is
 * truncated, because both can change the length, and trailing dots and spaces are trimmed AFTER every cut,
 * because a cut can expose new ones.
 *
 * Truncation only ever shortens the basename — an extension is what tells Obsidian and the OS what the file
 * is, so a truncated one turns a working `.png` into a broken `.pn`.
 *
 * @param params - The name and the platforms it must satisfy.
 * @returns The repaired name, unchanged when it was already valid, or `null` when no name survives the
 * repair — which is what the report calls out rather than failing silently.
 */
export function repairName(params: RepairNameParams): null | string {
  const profiles = getProfiles(params.platforms);

  if (profiles.length === 0) {
    return buildName(params.basename, params.extension);
  }

  let basename = params.basename;
  let extension = params.extension;

  for (const profile of profiles) {
    basename = replaceForbiddenCharacters(basename, profile);
    extension = replaceForbiddenCharacters(extension, profile);
  }

  // `note.md ` parses as basename `note` + extension `md `, so trimming only the basename would leave the
  // Trailing space exactly where Windows rejects it — at the end of the name.
  extension = trimTrailingDotsAndSpaces(extension, profiles);

  /*
   * Trim BEFORE the reserved-name test, never after: Windows strips trailing dots and spaces before it
   * decides, so `CON ` is reserved, and trimming afterwards would turn an accepted name into `CON`.
   */
  basename = trimTrailingDotsAndSpaces(basename, profiles);

  if (profiles.some((profile) => profile.hasWindowsNamingRules) && RESERVED_NAME_REG_EXP.test(basename)) {
    // A trailing underscore rather than a prefix: it keeps the name sorting where the user expects it.
    basename += '_';
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- Code points are exactly the unit wanted: cutting by UTF-16 unit would split a surrogate pair and leave half an emoji.
  const codePoints = [...basename];

  while (codePoints.length > 0) {
    const candidate = trimTrailingDotsAndSpaces(codePoints.join(''), profiles);

    if (candidate === '') {
      return null;
    }

    if (doesFitEveryProfile(candidate, extension, profiles, params)) {
      return buildName(candidate, extension);
    }

    codePoints.pop();
  }

  return null;
}

function buildName(basename: string, extension: string): string {
  return extension === '' ? basename : `${basename}.${extension}`;
}

function doesFitEveryProfile(basename: string, extension: string, profiles: PathCompatibilityProfile[], params: RepairNameParams): boolean {
  const name = buildName(basename, extension);
  const path = params.parentPath === '' ? name : `${params.parentPath}/${name}`;

  return profiles.every((profile) => {
    const maxPathLength = params.isFolder ? profile.maxFolderPathLength : profile.maxFilePathLength;
    const fullPathLength = params.maxVaultRootPathLength + 1 + measure(path, profile.shouldMeasureInBytes);

    return measure(name, profile.shouldMeasureInBytes) <= profile.maxNameLength && fullPathLength <= maxPathLength;
  });
}

function getBasenameOfName(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex <= 0 ? name : name.slice(0, dotIndex);
}

function getName(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? path : path.slice(slashIndex + 1);
}

function getProfiles(platforms: readonly PathCompatibilityPlatform[]): PathCompatibilityProfile[] {
  return platforms.map((platform) => PATH_COMPATIBILITY_PROFILES[platform]);
}

/*
 * `replace` rather than `test`: the library's regexps carry the `g` flag, and `test` on a `g`-flagged regexp
 * advances `lastIndex`, so consecutive calls on the same constant answer differently.
 */
function replaceForbiddenCharacters($string: string, profile: PathCompatibilityProfile): string {
  /*
   * One `-` per forbidden character rather than one per run: it keeps the name's visual structure, which is
   * what makes the repaired name still recognizable to whoever wrote it. Nothing is lost either way — the
   * original name is preserved in the note's frontmatter.
   */
  return $string
    .replace(getOsUnsafePathCharsRegExp(profile.hasWindowsNamingRules), '-')
    .replace(OBSIDIAN_UNSAFE_FILENAME_CHARS, '-');
}

function trimTrailingDotsAndSpaces($string: string, profiles: PathCompatibilityProfile[]): string {
  return profiles.some((profile) => profile.hasWindowsNamingRules) ? $string.replace(TRAILING_DOTS_AND_SPACES_REG_EXP, '') : $string;
}
