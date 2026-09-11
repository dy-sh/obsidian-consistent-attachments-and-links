import {
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import {
  dirname,
  join
} from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @file
 *
 * Fetches a community plugin's RELEASED build so an integration test can install the real thing into a live
 * vault, rather than a stub standing in for it.
 *
 * The cross-plugin suite needs this because a stub cannot prove what it is there to prove. Advanced Rename
 * and Delete Handler's own suite stages this plugin's attachment-unit-folder designation with a stub, and
 * this plugin's designation suite drives the publish side with no consumer — so on both sides the other
 * plugin is assumed rather than run. Only a released artifact settles whether the two actually agree.
 *
 * A released asset, deliberately, and not a locally built one: it is the build a user installs, it pins to a
 * version number the test can state, and it needs no checkout of the other repo to be present or buildable.
 *
 * Downloads land in a gitignored cache keyed by plugin and version, so a suite run after the first does no
 * network I/O at all, and a pinned version is fetched exactly once.
 */

/**
 * Parameters for {@link downloadReleasedPlugin}.
 */
export interface DownloadReleasedPluginParams {
  /**
   * The plugin's `manifest.id`, used as the cache folder name.
   */
  readonly pluginId: string;

  /**
   * The `owner/name` of the GitHub repository publishing the release.
   */
  readonly repo: string;

  /**
   * The release tag to download. A pinned version rather than `latest`: a test that silently follows a
   * moving artifact stops being a statement about anything.
   */
  readonly version: string;
}

/**
 * The files an Obsidian plugin needs in its folder to be loaded. `styles.css` is deliberately absent: it is
 * optional, and nothing under test reads it.
 */
export interface ReleasedPluginFiles {
  /**
   * The contents of the release's `main.js`.
   */
  readonly mainJs: string;

  /**
   * The contents of the release's `manifest.json`.
   */
  readonly manifestJson: string;
}

const CACHE_FOLDER_NAME = '.cache';

const REPO_ROOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Reads a plugin's released `manifest.json` and `main.js`, downloading them on first use.
 *
 * @param params - Which plugin, repository and release tag to read.
 * @returns The two files' contents.
 * @throws When an asset is neither cached nor downloadable.
 */
export async function downloadReleasedPlugin(params: DownloadReleasedPluginParams): Promise<ReleasedPluginFiles> {
  const cacheFolderPath = join(REPO_ROOT_PATH, CACHE_FOLDER_NAME, params.pluginId, params.version);

  return {
    mainJs: await readCachedAsset(cacheFolderPath, 'main.js', params),
    manifestJson: await readCachedAsset(cacheFolderPath, 'manifest.json', params)
  };
}

/**
 * Reads one asset from the cache, downloading and caching it when it is not there yet.
 *
 * @param cacheFolderPath - The folder holding this plugin version's cached assets.
 * @param assetName - The asset's file name, which is also its name in the release.
 * @param params - Which plugin, repository and release tag to read.
 * @returns The asset's contents.
 * @throws When the asset is neither cached nor downloadable.
 */
async function readCachedAsset(cacheFolderPath: string, assetName: string, params: DownloadReleasedPluginParams): Promise<string> {
  const cachedFilePath = join(cacheFolderPath, assetName);

  try {
    return await readFile(cachedFilePath, 'utf-8');
  } catch {
    // Not cached yet, which is the ordinary first-run path rather than a failure.
  }

  const url = `https://github.com/${params.repo}/releases/download/${params.version}/${assetName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status.toString()} ${response.statusText}`);
  }

  const content = await response.text();
  await mkdir(cacheFolderPath, { recursive: true });
  await writeFile(cachedFilePath, content, 'utf-8');
  return content;
}
