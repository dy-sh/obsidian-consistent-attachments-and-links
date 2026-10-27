import type { FileEntry } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  TAbstractFile
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  UnicodeNameNormalizer,
  UnicodeNormalizationOutcome
} from './unicode-name-normalizer.ts';

interface FakeAdapter {
  readonly files: Record<string, FileEntry>;
  readonly fs?: FakeCapacitorFs;
  readonly fsPromises?: FakeFsPromises;
  readonly getFullRealPath: (realPath: string) => string;
  readonly onFileChange: (path: null | string) => void;
  readonly queue: <T>(function_: () => Promise<T>) => Promise<T>;
  readonly startWatchPath?: (path: string) => Promise<void>;
  readonly stopWatchPath?: (path: string) => void;
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace watcher state to exercise the adapter restart path.
  watchers?: Record<string, unknown>;
}

interface FakeCapacitorEntry {
  readonly name: string;
}

interface FakeCapacitorFs {
  readonly readdir: (fullPath: string) => Promise<FakeCapacitorEntry[]>;
  readonly rename: (fullPath: string, newFullPath: string) => Promise<void>;
}

interface FakeFsPromises {
  readonly readdir: (fullPath: string) => Promise<string[]>;
  readonly rename: (fullPath: string, newFullPath: string) => Promise<void>;
}

interface HoistedState {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests replace the vault adapter to exercise platform-specific behavior.
  adapter: unknown;
}

const hoisted = vi.hoisted((): HoistedState => ({
  adapter: null
}));

vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getDataAdapterEx: (): unknown => hoisted.adapter
}));

// `й` composed (U+0439) and decomposed (U+0438 U+0306).
const NFC_NAME = 'й.md';
const NFD_NAME = NFC_NAME.normalize('NFD');
const NFC_FOLDER = 'папка-й';
const NFD_FOLDER = NFC_FOLDER.normalize('NFD');

const app = castTo<App>({});

let adapter: FakeAdapter;
let diskNames: Map<string, string[]>;
const originalOnFileChange = vi.fn();
const renameCalls: [string, string][] = [];

function createDesktopAdapter(): FakeAdapter {
  return {
    files: {},
    fsPromises: {
      readdir: vi.fn(async (fullPath: string): Promise<string[]> => {
        await noopAsync();
        return diskNames.get(fullPath) ?? [];
      }),
      rename: vi.fn(async (fullPath: string, newFullPath: string) => {
        renameCalls.push([fullPath, newFullPath]);
        await noopAsync();
      })
    },
    getFullRealPath: (realPath: string): string => `/vault/${realPath}`,
    onFileChange: originalOnFileChange,
    queue: async <T>(function_: () => Promise<T>): Promise<T> => await function_(),
    startWatchPath: vi.fn(async () => {
      await noopAsync();
    }),
    stopWatchPath: vi.fn(),
    watchers: {}
  };
}

function file(path: string): TAbstractFile {
  return castTo<TAbstractFile>({ path });
}

describe('UnicodeNameNormalizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    renameCalls.length = 0;
    diskNames = new Map([['/vault/', [NFD_NAME]]]);
    adapter = createDesktopAdapter();
    hoisted.adapter = adapter;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isNormalized', () => {
    it('should judge the name on disk, not the NFC vault path', () => {
      adapter.files[NFC_NAME] = { realpath: NFD_NAME, type: 'file' };
      expect(new UnicodeNameNormalizer({ app }).isNormalized(file(NFC_NAME))).toBe(false);
    });

    it('should judge only the last segment, since each folder is judged on its own', () => {
      adapter.files[`${NFC_FOLDER}/a.md`] = { realpath: `${NFD_FOLDER}/a.md`, type: 'file' };
      expect(new UnicodeNameNormalizer({ app }).isNormalized(file(`${NFC_FOLDER}/a.md`))).toBe(true);
    });

    it('should fall back to the vault path when the adapter has no entry', () => {
      expect(new UnicodeNameNormalizer({ app }).isNormalized(file(NFC_NAME))).toBe(true);
    });
  });

  describe('normalize', () => {
    it('should do nothing for an item the adapter does not know', async () => {
      expect(await new UnicodeNameNormalizer({ app }).normalize(file(NFC_NAME))).toBe(UnicodeNormalizationOutcome.NotNeeded);
      expect(renameCalls).toHaveLength(0);
    });

    it('should do nothing for a name already in NFC', async () => {
      adapter.files[NFC_NAME] = { realpath: NFC_NAME, type: 'file' };
      expect(await new UnicodeNameNormalizer({ app }).normalize(file(NFC_NAME))).toBe(UnicodeNormalizationOutcome.NotNeeded);
      expect(renameCalls).toHaveLength(0);
    });

    it('should rename through a temporary name and point the entry at the NFC name', async () => {
      const entry: FileEntry = { realpath: NFD_NAME, type: 'file' };
      adapter.files[NFC_NAME] = entry;

      expect(await new UnicodeNameNormalizer({ app }).normalize(file(NFC_NAME))).toBe(UnicodeNormalizationOutcome.Normalized);

      expect(renameCalls).toStrictEqual([
        [`/vault/${NFD_NAME}`, `/vault/${NFC_NAME}.nfc-tmp`],
        [`/vault/${NFC_NAME}.nfc-tmp`, `/vault/${NFC_NAME}`]
      ]);
      expect(entry.realpath).toBe(NFC_NAME);
    });

    it('should rename inside the item\'s own folder on disk', async () => {
      diskNames.set('/vault/notes', [NFD_NAME]);
      const entry: FileEntry = { realpath: `notes/${NFD_NAME}`, type: 'file' };
      adapter.files[`notes/${NFC_NAME}`] = entry;

      await new UnicodeNameNormalizer({ app }).normalize(file(`notes/${NFC_NAME}`));

      expect(renameCalls.at(-1)).toStrictEqual([`/vault/notes/${NFC_NAME}.nfc-tmp`, `/vault/notes/${NFC_NAME}`]);
      expect(entry.realpath).toBe(`notes/${NFC_NAME}`);
    });

    it('should pick a temporary name nothing on disk uses', async () => {
      diskNames.set('/vault/', [NFD_NAME, `${NFC_NAME}.nfc-tmp`]);
      adapter.files[NFC_NAME] = { realpath: NFD_NAME, type: 'file' };

      await new UnicodeNameNormalizer({ app }).normalize(file(NFC_NAME));

      expect(renameCalls[0]?.[1]).toBe(`/vault/${NFC_NAME}.nfc-tmp.nfc-tmp`);
    });

    // Windows and Linux treat the two forms as two names, so the NFC one can be a different file.
    it('should never overwrite a separate item spelled in NFC', async () => {
      diskNames.set('/vault/', [NFD_NAME, NFC_NAME]);
      const entry: FileEntry = { realpath: NFD_NAME, type: 'file' };
      adapter.files[NFC_NAME] = entry;

      expect(await new UnicodeNameNormalizer({ app }).normalize(file(NFC_NAME))).toBe(UnicodeNormalizationOutcome.Collision);
      expect(renameCalls).toHaveLength(0);
      expect(entry.realpath).toBe(NFD_NAME);
    });

    it('should move every descendant entry of a folder and restart the watchers under it', async () => {
      diskNames.set('/vault/', [NFD_FOLDER]);
      const child: FileEntry = { realpath: `${NFD_FOLDER}/a.md`, type: 'file' };
      const grandchild: FileEntry = { realpath: `${NFD_FOLDER}/sub/b.md`, type: 'file' };
      const outsider: FileEntry = { realpath: `${NFD_FOLDER}-other/c.md`, type: 'file' };
      adapter.files[NFC_FOLDER] = { realpath: NFD_FOLDER, type: 'folder' };
      adapter.files[`${NFC_FOLDER}/a.md`] = child;
      adapter.files[`${NFC_FOLDER}/sub/b.md`] = grandchild;
      adapter.files['other/c.md'] = outsider;
      adapter.watchers = { '/': {}, [`${NFC_FOLDER}/sub`]: {}, [NFC_FOLDER]: {}, 'other': {} };

      await new UnicodeNameNormalizer({ app }).normalize(file(NFC_FOLDER));

      expect(child.realpath).toBe(`${NFC_FOLDER}/a.md`);
      expect(grandchild.realpath).toBe(`${NFC_FOLDER}/sub/b.md`);
      expect(outsider.realpath).toBe(`${NFD_FOLDER}-other/c.md`);
      expect(adapter.stopWatchPath).toHaveBeenCalledTimes(2);
      expect(adapter.startWatchPath).toHaveBeenCalledWith(NFC_FOLDER);
      expect(adapter.startWatchPath).toHaveBeenCalledWith(`${NFC_FOLDER}/sub`);
    });

    it('should use the mobile adapter\'s file system, which has no per-folder watchers', async () => {
      const mobileRenames: [string, string][] = [];
      hoisted.adapter = {
        files: { [NFC_FOLDER]: { realpath: NFD_FOLDER, type: 'folder' } },
        fs: {
          readdir: async (): Promise<FakeCapacitorEntry[]> => {
            await noopAsync();
            return [{ name: NFD_FOLDER }];
          },
          rename: async (fullPath: string, newFullPath: string): Promise<void> => {
            mobileRenames.push([fullPath, newFullPath]);
            await noopAsync();
          }
        },
        getFullRealPath: (realPath: string): string => `/vault/${realPath}`,
        onFileChange: originalOnFileChange,
        queue: async <T>(function_: () => Promise<T>): Promise<T> => await function_()
      } satisfies FakeAdapter;

      expect(await new UnicodeNameNormalizer({ app }).normalize(file(NFC_FOLDER))).toBe(UnicodeNormalizationOutcome.Normalized);
      expect(mobileRenames.at(-1)).toStrictEqual([`/vault/${NFC_FOLDER}.nfc-tmp`, `/vault/${NFC_FOLDER}`]);
    });
  });

  // Without this, the watcher's report of the old name reads as a deletion and removes the note from the vault.
  describe('watcher events for the retired names', () => {
    beforeEach(async () => {
      diskNames.set('/vault/', [NFD_FOLDER]);
      adapter.files[NFC_FOLDER] = { realpath: NFD_FOLDER, type: 'folder' };
      await new UnicodeNameNormalizer({ app }).normalize(file(NFC_FOLDER));
    });

    it('should drop an event for the old name, anything under it, and the temporary name', () => {
      adapter.onFileChange(NFD_FOLDER);
      adapter.onFileChange(String.raw`/${NFD_FOLDER}\a.md`);
      adapter.onFileChange(`${NFC_FOLDER}.nfc-tmp`);
      expect(originalOnFileChange).not.toHaveBeenCalled();
    });

    it('should pass every other event through', () => {
      adapter.onFileChange(NFC_FOLDER);
      adapter.onFileChange(null);
      expect(originalOnFileChange).toHaveBeenCalledWith(NFC_FOLDER);
      expect(originalOnFileChange).toHaveBeenCalledWith(null);
    });

    it('should stop filtering once the window has passed', () => {
      vi.advanceTimersByTime(5000);
      expect(adapter.onFileChange).toBe(originalOnFileChange);
    });

    it('should keep filtering for a full window after a later rename', async () => {
      const normalizer = new UnicodeNameNormalizer({ app });
      vi.advanceTimersByTime(4000);
      diskNames.set('/vault/', [NFD_NAME]);
      adapter.files[NFC_NAME] = { realpath: NFD_NAME, type: 'file' };
      await normalizer.normalize(file(NFC_NAME));
      await normalizer.normalize(file(NFC_NAME));
      vi.advanceTimersByTime(4000);

      adapter.onFileChange(NFD_NAME);
      expect(originalOnFileChange).not.toHaveBeenCalled();
    });
  });
});
