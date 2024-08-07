import {
  normalizePath,
  type App,
  type ReferenceCache,
  type TFile
} from "obsidian";
import {
  getAllLinks,
  getCacheSafe
} from "./MetadataCache.ts";
import {
  applyFileChanges,
  createFolderSafe
} from "./Vault.ts";
import { posix } from "@jinder/path";
import { generateMarkdownLink } from "./GenerateMarkdownLink.ts";
const {
  basename,
  extname,
  dirname
} = posix;

type SplitSubpathResult = {
  linkPath: string;
  subpath: string | undefined;
}

export function splitSubpath(link: string): SplitSubpathResult {
  const SUBPATH_SEPARATOR = "#";
  const [linkPath = "", subpath] = link.split(SUBPATH_SEPARATOR);
  return {
    linkPath,
    subpath: subpath ? SUBPATH_SEPARATOR + subpath : undefined
  };
}

export async function updateLinksInFile(app: App, file: TFile, oldPath: string, renameMap: Map<string, string>, forceMarkdownLinks?: boolean): Promise<void> {
  await applyFileChanges(app, file, async () => {
    const cache = await getCacheSafe(app, file);
    if (!cache) {
      return [];
    }

    return await Promise.all(getAllLinks(cache).map(async (link) => ({
      startIndex: link.position.start.offset,
      endIndex: link.position.end.offset,
      oldContent: link.original,
      newContent: await convertLink(app, link, file, oldPath, renameMap, forceMarkdownLinks)
    })));
  });
}

function convertLink(app: App, link: ReferenceCache, source: TFile, oldPath: string, renameMap: Map<string, string>, forceMarkdownLinks?: boolean): Promise<string> {
  oldPath ??= source.path;
  return updateLink(app, link, extractLinkFile(app, link, oldPath), source, renameMap, forceMarkdownLinks);
}

export function extractLinkFile(app: App, link: ReferenceCache, oldPath: string): TFile | null {
  const { linkPath } = splitSubpath(link.link);
  return app.metadataCache.getFirstLinkpathDest(linkPath, oldPath);
}

export async function updateLink(app: App, link: ReferenceCache, file: TFile | null, source: TFile, renameMap: Map<string, string>, forceMarkdownLinks?: boolean): Promise<string> {
  if (!file) {
    return link.original;
  }
  const isEmbed = link.original.startsWith("!");
  const isWikilink = link.original.includes("[[") && forceMarkdownLinks !== true;
  const { subpath } = splitSubpath(link.link);

  const oldPath = file.path;
  const newPath = renameMap.get(file.path);
  const isOldFileRenamed = newPath && newPath !== oldPath;

  const alias = getAlias(app, link.displayText, file, newPath, source.path);

  if (isOldFileRenamed) {
    await createFolderSafe(app, dirname(newPath));
    await app.vault.rename(file, newPath);
  }

  const newLink = generateMarkdownLink(app, file, source.path, subpath, alias, isEmbed, isWikilink);

  if (isOldFileRenamed) {
    await app.vault.rename(file, oldPath);
  }

  return newLink;
}

function getAlias(app: App, displayText: string | undefined, oldFile: TFile, newPath: string | undefined, sourcePath: string): string | undefined {
  if (!displayText) {
    return undefined;
  }

  const cleanDisplayText = normalizePath(displayText.split(" > ")[0]!).replace(/\.\//g, "");

  for (const path of [oldFile.path, newPath]) {
    if (!path) {
      continue;
    }
    const extension = extname(path);
    const fileNameWithExtension = basename(path);
    const fileNameWithoutExtension = basename(path, extension);
    if (cleanDisplayText === path || cleanDisplayText === fileNameWithExtension || cleanDisplayText === fileNameWithoutExtension) {
      return undefined;
    }
  }

  for (const omitMdExtension of [true, false]) {
    const linkText = app.metadataCache.fileToLinktext(oldFile, sourcePath, omitMdExtension);
    if (cleanDisplayText === linkText) {
      return undefined;
    }
  }

  return displayText;
}
