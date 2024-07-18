import type {
  App,
  CachedMetadata,
  LinkCache,
  TFile
} from "obsidian";
import { retryWithTimeout } from "./Async.ts";

export async function getCacheSafe(app: App, fileOrPath: TFile | string): Promise<CachedMetadata> {
  const file = typeof fileOrPath === "string" ? app.vault.getFileByPath(fileOrPath) : fileOrPath;

  if (!file) {
    throw new Error(`File ${fileOrPath} not found`);
  }

  let cache: CachedMetadata | null = null;

  await retryWithTimeout(async () => {
    const fileInfo = app.metadataCache.getFileInfo(file.path);
    const stat = await app.vault.adapter.stat(file.path);

    if (!fileInfo) {
      console.debug(`File cache info for ${file.path} is missing`);
      return false;
    } else if (!stat) {
      console.debug(`File stat for ${file.path} is missing`);
      return false;
    } else if (fileInfo.mtime < stat.mtime) {
      console.debug(`File cache info for ${file.path} is from ${new Date(fileInfo.mtime).toString()} which is older than the file modification timestamp ${new Date(stat.mtime).toString()}`);
      return false;
    } else {
      cache = app.metadataCache.getFileCache(file);
      if (!cache) {
        console.debug(`File cache for ${file.path} is missing`);
        return false;
      } else {
        return true;
      }
    }
  });

  return cache!;
}

export function getAllLinks(cache: CachedMetadata): LinkCache[] {
  const links: LinkCache[] = [];

  if (cache.links) {
    links.push(...cache.links);
  }

  if (cache.embeds) {
    links.push(...cache.embeds);
  }

  links.sort((a, b) => a.position.start.offset - b.position.start.offset);
  return links;
}
