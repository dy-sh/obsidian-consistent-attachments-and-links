import {
  App,
  TFile,
  Vault,
  type ReferenceCache,
  type TAbstractFile
} from "obsidian";
import type ConsistentAttachmentsAndLinksPlugin from "./ConsistentAttachmentsAndLinksPlugin.ts";
import { posix } from "@jinder/path";
const {
  basename,
  extname,
  relative,
  join,
  dirname
} = posix;
import {
  isNote,
  removeFolderSafe,
  applyFileChanges,
  processWithRetry,
  createFolderSafe,
  removeEmptyFolderHierarchy
} from "./Vault.ts";
import {
  getAllLinks,
  getCacheSafe
} from "./MetadataCache.ts";
import { generateMarkdownLink } from "./GenerateMarkdownLink.ts";
import type { CanvasData } from "obsidian/canvas.js";
import { toJson } from "./Object.ts";
import { splitSubpath } from "./Link.ts";
import { getAttachmentFolderPath } from "./AttachmentPath.ts";

const renameMap = new Map<string, string>();

export async function handleRename(plugin: ConsistentAttachmentsAndLinksPlugin, file: TAbstractFile, oldPath: string): Promise<void> {
  if (renameMap.size > 0) {
    return;
  }

  console.debug("Handle Rename");

  if (!(file instanceof TFile)) {
    return;
  }

  const app = plugin.app;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const updateAllLinks = app.fileManager.updateAllLinks;
  try {
    plugin.app.fileManager.updateAllLinks = async (): Promise<void> => { };

    await fillRenameMap(app, file, oldPath);

    for (const [oldPath2, newPath2] of renameMap.entries()) {
      await processRename(app, oldPath2, newPath2);
    }
  } finally {
    renameMap.delete(oldPath);
    plugin.app.fileManager.updateAllLinks = updateAllLinks;
  }
}

export async function handleDelete(plugin: ConsistentAttachmentsAndLinksPlugin, file: TAbstractFile): Promise<void> {
  console.debug("Handle Delete");
  if (!isNote(file)) {
    return;
  }

  const dummyAttachmentPath = await plugin.app.vault.getAvailablePathForAttachments("DUMMY_FILE", "pdf", file);
  const attachmentFolder = dirname(dummyAttachmentPath);
  await removeFolderSafe(plugin.app, attachmentFolder, file.path);
}

async function updateLinksInFile(app: App, file: TFile, oldPath: string): Promise<void> {
  await applyFileChanges(app, file, async () => {
    const cache = await getCacheSafe(app, file);
    if (!cache) {
      return [];
    }

    return await Promise.all(getAllLinks(cache).map(async (link) => ({
      startIndex: link.position.start.offset,
      endIndex: link.position.end.offset,
      oldContent: link.original,
      newContent: await convertLink(app, link, file, oldPath)
    })));
  });
}

async function updateLink(app: App, link: ReferenceCache, file: TFile | null, source: TFile): Promise<string> {
  if (!file) {
    return link.original;
  }
  const isEmbed = link.original.startsWith("!");
  const isWikilink = link.original.includes("[[");
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

function convertLink(app: App, link: ReferenceCache, source: TFile, oldPath: string): Promise<string> {
  oldPath ??= source.path;
  return updateLink(app, link, extractLinkFile(app, link, oldPath), source);
}

function extractLinkFile(app: App, link: ReferenceCache, oldPath: string): TFile | null {
  const { linkPath } = splitSubpath(link.link);
  return app.metadataCache.getFirstLinkpathDest(linkPath, oldPath);
}

async function fillRenameMap(app: App, file: TFile, oldPath: string): Promise<void> {
  renameMap.set(oldPath, file.path);

  if (!isNote(file)) {
    return;
  }

  const oldAttachmentFolderPath = await getAttachmentFolderPath(app, oldPath);
  const newAttachmentFolderPath = await getAttachmentFolderPath(app, file.path);

  const oldAttachmentFolder = app.vault.getFolderByPath(oldAttachmentFolderPath);

  if (!oldAttachmentFolder) {
    return;
  }

  if (oldAttachmentFolderPath === newAttachmentFolderPath){
    return;
  }

  const children: TFile[] = [];

  Vault.recurseChildren(oldAttachmentFolder, (child) => {
    if (child instanceof TFile) {
      children.push(child);
    }
  });

  for (let child of children) {
    if (isNote(child)) {
      continue;
    }
    child = child as TFile;
    const relativePath = relative(oldAttachmentFolderPath, child.path);
    const newDir = join(newAttachmentFolderPath, dirname(relativePath));
    let newChildPath = join(newDir, child.name);
    if (child.path !== newChildPath) {
      newChildPath = app.vault.getAvailablePath(join(newDir, child.basename), child.extension);
      renameMap.set(child.path, newChildPath);
    }
  }
}

async function processRename(app: App, oldPath: string, newPath: string): Promise<void> {
  const oldFile = app.vault.getFileByPath(oldPath);
  const newFile = app.vault.getFileByPath(newPath);
  const file = oldFile ?? newFile;
  if (!file) {
    return;
  }
  const backlinks = app.metadataCache.getBacklinksForFile(file);

  for (const parentNotePath of backlinks.keys()) {
    let parentNote = app.vault.getFileByPath(parentNotePath);
    if (!parentNote) {
      const newParentNotePath = renameMap.get(parentNotePath);
      if (newParentNotePath) {
        parentNote = app.vault.getFileByPath(newParentNotePath);
      }
    }

    if (!parentNote) {
      console.error(`Parent note not found: ${parentNotePath}`);
      continue;
    }

    await applyFileChanges(app, parentNote, async () => {
      const links = app.metadataCache.getBacklinksForFile(file).get(parentNotePath) ?? [];
      const changes = [];

      for (const link of links) {
        changes.push({
          startIndex: link.position.start.offset,
          endIndex: link.position.end.offset,
          oldContent: link.original,
          newContent: await updateLink(app, link, file, parentNote)
        });
      }

      return changes;
    });
  }

  if (file.extension.toLowerCase() === "canvas") {
    await processWithRetry(app, file, (content) => {
      const canvasData = JSON.parse(content) as CanvasData;
      for (const node of canvasData.nodes) {
        if (node.type !== "file") {
          continue;
        }
        const newPath = renameMap.get(node.file);
        if (!newPath) {
          continue;
        }
        node.file = newPath;
      }
      return toJson(canvasData);
    });
  } else if (file.extension.toLowerCase() === "md") {
    await updateLinksInFile(app, file, oldPath);
  }

  if (oldFile) {
    await createFolderSafe(app, dirname(newPath));
    const oldFolder = oldFile.parent;
    await app.vault.rename(oldFile, newPath);
    renameMap.delete(oldPath);
    await removeEmptyFolderHierarchy(app, oldFolder);
  }
}

function getAlias(app: App, displayText: string | undefined, oldFile: TFile, newPath: string | undefined, sourcePath: string): string | undefined {
  if (!displayText) {
    return undefined;
  }

  for (const path of [oldFile.path, newPath]) {
    if (!path) {
      continue;
    }
    const extension = extname(path);
    const fileNameWithExtension = basename(path);
    const fileNameWithoutExtension = basename(path, extension);
    if (displayText === path || displayText === fileNameWithExtension || displayText === fileNameWithoutExtension) {
      return undefined;
    }
  }

  for (const omitMdExtension of [true, false]) {
    const linkText = app.metadataCache.fileToLinktext(oldFile, sourcePath, omitMdExtension);
    if (displayText === linkText) {
      return undefined;
    }
  }

  return displayText;
}
