import {
  App,
  type CachedMetadata,
  type ReferenceCache,
  TFile
} from "obsidian";
import {
  LinksHandler,
  type PathChangeInfo
} from "./links-handler.ts";
import { Utils } from "./utils.ts";
import { path } from "./path.ts";

export interface MovedAttachmentResult {
  movedAttachments: PathChangeInfo[]
  renamedFiles: PathChangeInfo[],
}

export class FilesHandler {
  constructor(
    private app: App,
    private lh: LinksHandler,
    private consoleLogPrefix: string = "",
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
  ) { }

  isPathIgnored(path: string): boolean {
    if (path.startsWith("./"))
      path = path.substring(2);

    for (const folder of this.ignoreFolders) {
      if (path.startsWith(folder)) {
        return true;
      }
    }

    for (const fileRegex of this.ignoreFilesRegex) {
      const testResult = fileRegex.test(path);
      // console.log(path,fileRegex,testResult)
      if (testResult) {
        return true;
      }
    }

    return false;
  }

  async createFolderForAttachmentFromLink(link: string, owningNotePath: string) {
    const newFullPath = this.lh.getFullPathForLink(link, owningNotePath);
    return await this.createFolderForAttachmentFromPath(newFullPath);
  }

  async createFolderForAttachmentFromPath(filePath: string) {
    const newParentFolder = filePath.substring(0, filePath.lastIndexOf("/"));
    try {
      //todo check folder exist
      await this.app.vault.createFolder(newParentFolder);
    } catch { }
  }

  generateFileCopyName(originalName: string): string {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const dir = path.dirname(originalName);
    for (let i = 1; i < 100000; i++) {
      const newName = dir + "/" + baseName + " " + i + ext;
      const existFile = this.lh.getFileByPath(newName);
      if (!existFile)
        return newName;
    }
    return "";
  }

  async moveCachedNoteAttachments(oldNotePath: string, newNotePath: string,
    deleteExistFiles: boolean, attachmentsSubfolder: string, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {

    if (this.isPathIgnored(oldNotePath) || this.isPathIgnored(newNotePath)) {
      return { movedAttachments: [], renamedFiles: [] };
    }

    //try to get embeds for old or new path (metadataCache can be updated or not)
    //!!! this can return undefined if note was just updated

    const embeds = (await Utils.getCacheSafe(newNotePath)).embeds;

    if (!embeds) {
      return { movedAttachments: [], renamedFiles: [] };
    }

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    for (const embed of embeds) {
      const link = embed.link;
      const oldLinkPath = this.lh.getFullPathForLink(link, oldNotePath);

      if (result.movedAttachments.findIndex(x => x.oldPath == oldLinkPath) != -1)
        continue;//already moved

      let file = this.lh.getFileByLink(link, oldNotePath);
      if (!file) {
        file = this.lh.getFileByLink(link, newNotePath);
        if (!file) {
          console.error(this.consoleLogPrefix + oldNotePath + " has bad embed (file does not exist): " + link);
          continue;
        }
      }

      //if attachment not in the note folder, skip it
      // = "." means that note was at root path, so do not skip it
      if (path.dirname(oldNotePath) != "." && !path.dirname(oldLinkPath).startsWith(path.dirname(oldNotePath)))
        continue;

      const newLinkPath = this.getNewAttachmentPath(file.path, newNotePath, attachmentsSubfolder);

      if (newLinkPath == file.path) //nothing to move
        continue;

      const res = await this.moveAttachment(file, newLinkPath, [oldNotePath, newNotePath], deleteExistFiles, deleteEmptyFolders);
      result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
      result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);

    }

    return result;
  }

  getNewAttachmentPath(oldAttachmentPath: string, notePath: string, subfolderName: string): string {
    const resolvedSubFolderName = subfolderName.replace(/\${filename}/g, path.basename(notePath, ".md"));
    let newPath = (resolvedSubFolderName == "") ? path.dirname(notePath) : path.join(path.dirname(notePath), resolvedSubFolderName);
    newPath = Utils.normalizePathForFile(path.join(newPath, path.basename(oldAttachmentPath)));
    return newPath;
  }


  async collectAttachmentsForCachedNote(notePath: string, subfolderName: string,
    deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {

    if (this.isPathIgnored(notePath)) {
      return { movedAttachments: [], renamedFiles: [] };
    }

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    const cache = await Utils.getCacheSafe(notePath);

    for (const reference of this.getReferences(cache)) {
      const link = this.lh.splitLinkToPathAndSection(reference.link).link;

      if (link.startsWith("#")) {
        // internal section link
        continue;
      }

      const fullPathLink = this.lh.getFullPathForLink(link, notePath);
      if (result.movedAttachments.findIndex(x => x.oldPath == fullPathLink) != -1) {
        // already moved
        continue;
      }

      const file = this.lh.getFileByLink(link, notePath);
      if (!file) {
        const type = reference.original.startsWith("!") ? "embed" : "link";
        console.error(`${this.consoleLogPrefix}${notePath} has bad ${type} (file does not exist): ${link}`);
        continue;
      }

      const extension = file.extension.toLowerCase();

      if (extension === "md" || file.extension === "canvas") {
        // internal file link
        continue;
      }

      const newPath = this.getNewAttachmentPath(file.path, notePath, subfolderName);

      if (newPath == file.path) {
        // nothing to move
        continue;
      }

      const res = await this.moveAttachment(file, newPath, [notePath], deleteExistFiles, deleteEmptyFolders);

      result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
      result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);
    }

    return result;
  }


  async moveAttachment(file: TFile, newLinkPath: string, parentNotePaths: string[], deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {
    const path = file.path;

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    if (this.isPathIgnored(path))
      return result;


    if (path == newLinkPath) {
      console.warn(this.consoleLogPrefix + "Can't move file. Source and destination path the same.");
      return result;
    }

    await this.createFolderForAttachmentFromPath(newLinkPath);

    const linkedNotes = await this.lh.getCachedNotesThatHaveLinkToFile(path);
    if (parentNotePaths) {
      for (const notePath of parentNotePaths) {
        linkedNotes.remove(notePath);
      }
    }

    if (path !== file.path) {
      console.warn(this.consoleLogPrefix + "File was moved already");
      return await this.moveAttachment(file, newLinkPath, parentNotePaths, deleteExistFiles, deleteEmptyFolders);
    }

    //if no other file has link to this file - try to move file
    //if file already exist at new location - delete or move with new name
    if (linkedNotes.length == 0) {
      const existFile = this.lh.getFileByPath(newLinkPath);
      if (!existFile) {
        //move
        console.log(this.consoleLogPrefix + "move file [from, to]: \n   " + path + "\n   " + newLinkPath);
        result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
        await this.app.vault.rename(file, newLinkPath);
      } else {
        if (deleteExistFiles) {
          //delete
          console.log(this.consoleLogPrefix + "delete file: \n   " + path);
          result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
          await this.deleteFile(file, deleteEmptyFolders);
        } else {
          //move with new name
          const newFileCopyName = this.generateFileCopyName(newLinkPath);
          console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + path + "\n   " + newFileCopyName);
          result.movedAttachments.push({ oldPath: path, newPath: newFileCopyName });
          await this.app.vault.rename(file, newFileCopyName);
          result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName });
        }
      }
    }
    //if some other file has link to this file - try to copy file
    //if file already exist at new location - copy file with new name or do nothing
    else {
      const existFile = this.lh.getFileByPath(newLinkPath);
      if (!existFile) {
        //copy
        console.log(this.consoleLogPrefix + "copy file [from, to]: \n   " + path + "\n   " + newLinkPath);
        result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
        await this.app.vault.copy(file, newLinkPath);
      } else {
        if (deleteExistFiles) {
          //do nothing
        } else {
          //copy with new name
          const newFileCopyName = this.generateFileCopyName(newLinkPath);
          console.log(this.consoleLogPrefix + "copy file with new name [from, to]: \n   " + path + "\n   " + newFileCopyName);
          result.movedAttachments.push({ oldPath: file.path, newPath: newFileCopyName });
          await this.app.vault.copy(file, newFileCopyName);
          result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName });
        }
      }
    }
    return result;
  }




  async deleteEmptyFolders(dirName: string) {
    if (this.isPathIgnored(dirName))
      return;

    if (dirName.startsWith("./"))
      dirName = dirName.substring(2);


    let list = await this.app.vault.adapter.list(dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await this.app.vault.adapter.list(dirName);
    if (list.files.length == 0 && list.folders.length == 0) {
      console.log(this.consoleLogPrefix + "delete empty folder: \n   " + dirName);
      if (await this.app.vault.adapter.exists(dirName))
        await this.app.vault.adapter.rmdir(dirName, false);
    }
  }

  async deleteUnusedAttachmentsForCachedNote(notePath: string, cache: CachedMetadata, deleteEmptyFolders: boolean) {
    if (this.isPathIgnored(notePath))
      return;

    for (const reference of this.getReferences(cache)) {
      const link = reference.link;
      const file = this.lh.getFileByLink(link, notePath, false);

      if (!file || file.extension.toLowerCase() === "md") {
        continue;
      }

      const linkedNotes = await this.lh.getCachedNotesThatHaveLinkToFile(file.path);
      if (linkedNotes.length == 0) {
        try {
          await this.deleteFile(file, deleteEmptyFolders);
        } catch { }
      }
    }
  }

  getReferences(cache: CachedMetadata): ReferenceCache[] {
    return [...(cache.embeds ?? []), ...(cache.links ?? [])];
  }

  async deleteFile(file: TFile, deleteEmptyFolders: boolean): Promise<void> {
    await this.app.vault.trash(file, true);
    if (deleteEmptyFolders) {
      let dir = file.parent!;
      while (dir.children.length === 0) {
        await this.app.vault.trash(dir, true);
        dir = dir.parent!;
      }
    }
  }
}
