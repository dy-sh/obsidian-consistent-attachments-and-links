/**
 * @file
 *
 * The one repair `Fix incompatible paths` makes on disk WITHOUT a vault rename: a name stored in a form other
 * than Unicode NFC, e.g. `й` stored as `и` followed by a combining breve. Such names come from outside
 * Obsidian (old macOS volumes, archives, other tools), and sync, git and backup tools see the two forms as two
 * different names.
 *
 * Obsidian keys its file index by the NFC path and keeps the name on disk in the adapter entry's `realpath`
 * (measured in 1.14.4, both `FileSystemAdapter` and `CapacitorAdapter`). So `file.path` is always NFC, only
 * `realpath` can show the problem, and the repaired vault path is the very string it already is. That is why
 * `vault.rename` cannot do this: it returns early when the old and new paths are equal.
 *
 * A bare `fs.rename` is not enough either, and this is the trap: the watcher then reports the OLD real path,
 * `reconcileFile` finds nothing there, and its retry 100 ms later calls `removeFile` on the NFC path — which
 * deletes the note from the vault while it sits on disk under its new name. So the rename runs inside the
 * adapter's own queue, the adapter entries are rewritten in the same step, and watcher events for the
 * retired real paths are dropped for a short while afterwards.
 */

import type { DataAdapterEx } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CapacitorAdapter,
  FileSystemAdapter,
  TAbstractFile
} from 'obsidian';

import { around } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { getDataAdapterEx } from '@obsidian-typings/obsidian-public-latest/implementations';

import { isUnicodeNormalized } from './path-compatibility.ts';

/**
 * What {@link UnicodeNameNormalizer.normalize} did.
 */
export enum UnicodeNormalizationOutcome {
  /**
   * The folder on disk already holds a separate entry spelled in NFC. Windows and Linux treat the two forms
   * as two names, so renaming would overwrite it; nothing was changed.
   */
  Collision = 'Collision',
  Normalized = 'Normalized',
  NotNeeded = 'NotNeeded'
}

interface RawFileSystem {
  readdir: (fullPath: string) => Promise<string[]>;
  rename: (fullPath: string, newFullPath: string) => Promise<void>;
}

interface UnicodeNameNormalizerConstructorParams {
  readonly app: App;
}

/**
 * How long watcher events for a retired real path are dropped. The events of a rename arrive within
 * milliseconds; the margin covers a busy machine.
 */
const RETIRED_REAL_PATH_WINDOW_IN_MILLISECONDS = 5000;

/**
 * The on-disk rename goes through a temporary name, so it also changes the stored name on a filesystem that
 * treats the two forms as one name (APFS), where a direct rename between them may do nothing.
 */
const TEMPORARY_NAME_SUFFIX = '.nfc-tmp';

export class UnicodeNameNormalizer {
  private readonly app: App;
  private readonly retiredRealPaths = new Set<string>();
  private uninstallTimeoutId: null | number = null;
  private uninstallWatcherFilter: (() => void) | null = null;

  public constructor(params: UnicodeNameNormalizerConstructorParams) {
    this.app = params.app;
  }

  /**
   * Whether the item's name, as stored on disk, is NFC.
   *
   * @param file - The file or folder.
   * @returns Whether it is.
   */
  public isNormalized(file: TAbstractFile): boolean {
    const realPath = getDataAdapterEx(this.app).files[file.path]?.realpath ?? file.path;
    return isUnicodeNormalized(getName(realPath));
  }

  /**
   * Renames the item on disk to the NFC form of its name. The vault path does not change, so no link, no
   * open editor and no rename handler sees anything happen.
   *
   * @param file - The file or folder. Its parent folders must already be NFC on disk, or be repaired first.
   * @returns What was done.
   */
  public async normalize(file: TAbstractFile): Promise<UnicodeNormalizationOutcome> {
    const adapter = getDataAdapterEx(this.app);
    return await adapter.queue(async () => await this.normalizeInQueue(adapter, file.path));
  }

  private isRetired(changedPath: null | string): boolean {
    if (changedPath === null) {
      return false;
    }

    const path = toRelativeRealPath(changedPath);
    return [...this.retiredRealPaths].some((retiredPath) => path === retiredPath || path.startsWith(`${retiredPath}/`));
  }

  private async normalizeInQueue(adapter: DataAdapterEx, path: string): Promise<UnicodeNormalizationOutcome> {
    const entry = adapter.files[path];

    if (entry === undefined) {
      return UnicodeNormalizationOutcome.NotNeeded;
    }

    const realPath = entry.realpath;
    const realName = getName(realPath);

    if (isUnicodeNormalized(realName)) {
      return UnicodeNormalizationOutcome.NotNeeded;
    }

    const realParentPath = getParentPath(realPath);
    const normalizedName = realName.normalize('NFC');
    const fileSystem = getRawFileSystem(adapter);
    const siblingNames = await fileSystem.readdir(adapter.getFullRealPath(realParentPath));

    if (siblingNames.includes(normalizedName)) {
      return UnicodeNormalizationOutcome.Collision;
    }

    let temporaryName = `${normalizedName}${TEMPORARY_NAME_SUFFIX}`;

    while (siblingNames.includes(temporaryName)) {
      temporaryName += TEMPORARY_NAME_SUFFIX;
    }

    const temporaryRealPath = joinPath(realParentPath, temporaryName);
    const normalizedRealPath = joinPath(realParentPath, normalizedName);

    this.retire(adapter, realPath);
    this.retire(adapter, temporaryRealPath);

    await fileSystem.rename(adapter.getFullRealPath(realPath), adapter.getFullRealPath(temporaryRealPath));
    await fileSystem.rename(adapter.getFullRealPath(temporaryRealPath), adapter.getFullRealPath(normalizedRealPath));

    entry.realpath = normalizedRealPath;

    if (entry.type === 'folder') {
      for (const descendant of Object.values(adapter.files)) {
        if (descendant.realpath.startsWith(`${realPath}/`)) {
          descendant.realpath = normalizedRealPath + descendant.realpath.slice(realPath.length);
        }
      }

      await restartWatchers(adapter, path);
    }

    return UnicodeNormalizationOutcome.Normalized;
  }

  private retire(adapter: DataAdapterEx, realPath: string): void {
    this.retiredRealPaths.add(realPath);

    if (this.uninstallWatcherFilter === null) {
      // An arrow, so the patched method below can keep its own `this`, the adapter.
      const isRetired = (changedPath: null | string): boolean => this.isRetired(changedPath);
      this.uninstallWatcherFilter = around(adapter, {
        onFileChange: (next) =>
          function onFileChange(this: DataAdapterEx, changedPath: null | string): void {
            if (isRetired(changedPath)) {
              return;
            }

            next.call(this, changedPath);
          }
      });
    }

    if (this.uninstallTimeoutId !== null) {
      window.clearTimeout(this.uninstallTimeoutId);
    }

    this.uninstallTimeoutId = window.setTimeout(() => {
      this.uninstallTimeoutId = null;
      this.retiredRealPaths.clear();
      this.uninstallWatcherFilter?.();
      this.uninstallWatcherFilter = null;
    }, RETIRED_REAL_PATH_WINDOW_IN_MILLISECONDS);
  }
}

function getName(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? path : path.slice(slashIndex + 1);
}

function getParentPath(path: string): string {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? '' : path.slice(0, slashIndex);
}

function getRawFileSystem(adapter: DataAdapterEx): RawFileSystem {
  if ('fsPromises' in adapter) {
    const fileSystemAdapter = castTo<FileSystemAdapter>(adapter);
    return {
      readdir: async (fullPath): Promise<string[]> => await fileSystemAdapter.fsPromises.readdir(fullPath),
      rename: async (fullPath, newFullPath): Promise<void> => {
        await fileSystemAdapter.fsPromises.rename(fullPath, newFullPath);
      }
    };
  }

  const capacitorAdapter = castTo<CapacitorAdapter>(adapter);
  return {
    readdir: async (fullPath): Promise<string[]> => {
      const entries = await capacitorAdapter.fs.readdir(fullPath);
      return entries.map((entry) => entry.name);
    },
    rename: async (fullPath, newFullPath): Promise<void> => {
      await capacitorAdapter.fs.rename(fullPath, newFullPath);
    }
  };
}

function joinPath(parentPath: string, name: string): string {
  return parentPath === '' ? name : `${parentPath}/${name}`;
}

/**
 * Restarts the watchers of a renamed folder and of every folder under it.
 *
 * Only Linux watches folder by folder (Windows and macOS watch the vault root recursively), and each such
 * watcher captured its folder's real path when it started. Left running, it would keep reporting changes
 * under the retired name, and every one of them would read as a deletion.
 *
 * @param adapter - The adapter.
 * @param path - The renamed folder's vault path.
 */
async function restartWatchers(adapter: DataAdapterEx, path: string): Promise<void> {
  if (!('watchers' in adapter)) {
    return;
  }

  const fileSystemAdapter = castTo<FileSystemAdapter>(adapter);

  for (const watchedPath of Object.keys(fileSystemAdapter.watchers)) {
    if (!(watchedPath === path || watchedPath.startsWith(`${path}/`))) {
      continue;
    }

    fileSystemAdapter.stopWatchPath(watchedPath);
    await fileSystemAdapter.startWatchPath(watchedPath);
  }
}

/*
 * Not `normalizePath`: Obsidian's composes to NFC, which would make every retired NFD path look like the live
 * NFC one.
 */
function toRelativeRealPath(path: string): string {
  return path.replaceAll('\\', '/').replaceAll(/\/{2,}/g, '/').replaceAll(/^\/|\/$/g, '');
}
