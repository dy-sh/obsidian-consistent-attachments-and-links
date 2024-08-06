import {
  App,
  TFile
} from "obsidian";
import {
  LinksHandler,
  type PathChangeInfo
} from "./links-handler.ts";
import {
  getAllLinks,
  getCacheSafe
} from "./MetadataCache.ts";
import { posix } from "@jinder/path";
const {
  basename,
  dirname,
  extname,
  join
} = posix;
import { splitSubpath } from "./Link.ts";
import { getAttachmentFilePath } from "./AttachmentPath.ts";
import {
  createFolderSafe,
  removeEmptyFolderHierarchy,
  safeList
} from "./Vault.ts";

export interface MovedAttachmentResult {
  movedAttachments: PathChangeInfo[]
  renamedFiles: PathChangeInfo[],
}

export class FilesHandler {
  public constructor(
    private app: App,
    private lh: LinksHandler,
    private consoleLogPrefix: string = "",
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
  ) { }

  private isPathIgnored(path: string): boolean {
    if (path.startsWith("./")) {
      path = path.substring(2);
    }

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

  private async createFolderForAttachmentFromPath(filePath: string): Promise<void> {
    await createFolderSafe(this.app, dirname(filePath));
  }

  private generateFileCopyName(path: string): string {
    const ext = extname(path);
    const dir = dirname(path);
    const fileName = basename(path, ext);
    return this.app.vault.getAvailablePath(join(dir, fileName), ext.slice(1));
  }

  public async collectAttachmentsForCachedNote(notePath: string,
    deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {

    if (this.isPathIgnored(notePath)) {
      return { movedAttachments: [], renamedFiles: [] };
    }

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    const cache = await getCacheSafe(this.app, notePath);

    if (!cache) {
      return result;
    }

    for (const link of getAllLinks(cache)) {
      const { linkPath } = splitSubpath(link.link);

      if (!linkPath) {
        continue;
      }

      const fullPathLink = this.lh.getFullPathForLink(linkPath, notePath);
      if (result.movedAttachments.findIndex(x => x.oldPath == fullPathLink) != -1) {
        // already moved
        continue;
      }

      const file = this.lh.getFileByLink(linkPath, notePath);
      if (!file) {
        const type = link.original.startsWith("!") ? "embed" : "link";
        console.error(`${this.consoleLogPrefix}${notePath} has bad ${type} (file does not exist): ${linkPath}`);
        continue;
      }

      if (!this.isAttachment(file)) {
        continue;
      }

      const newPath = await getAttachmentFilePath(this.app, file.path, notePath);

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

  private async moveAttachment(file: TFile, newLinkPath: string, parentNotePaths: string[], deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {
    const path = file.path;

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    if (this.isPathIgnored(path)) {
      return result;
    }

    if (!this.isAttachment(file)) {
      return result;
    }

    if (path == newLinkPath) {
      console.warn(this.consoleLogPrefix + "Can't move file. Source and destination path the same.");
      return result;
    }

    await this.createFolderForAttachmentFromPath(newLinkPath);

    const linkedNotes = this.lh.getCachedNotesThatHaveLinkToFile(path);
    if (parentNotePaths) {
      for (const notePath of parentNotePaths) {
        linkedNotes.remove(notePath);
      }
    }

    if (path !== file.path) {
      console.warn(this.consoleLogPrefix + "File was moved already");
      return await this.moveAttachment(file, newLinkPath, parentNotePaths, deleteExistFiles, deleteEmptyFolders);
    }

    const oldFolder = file.parent;
    //if no other file has link to this file - try to move file
    //if file already exist at new location - delete or move with new name
    if (linkedNotes.length == 0) {
      const existFile = this.app.vault.getFileByPath(newLinkPath);
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
    } else {
      //if some other file has link to this file - try to copy file
      //if file already exist at new location - copy file with new name or do nothing
      const existFile = this.app.vault.getFileByPath(newLinkPath);
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

    await removeEmptyFolderHierarchy(this.app, oldFolder);
    return result;
  }

  public async deleteEmptyFolders(dirName: string): Promise<void> {
    if (this.isPathIgnored(dirName)) {
      return;
    }

    if (dirName.startsWith("./")) {
      dirName = dirName.substring(2);
    }

    let list = await safeList(this.app, dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await safeList(this.app, dirName);
    if (list.files.length == 0 && list.folders.length == 0) {
      console.log(this.consoleLogPrefix + "delete empty folder: \n   " + dirName);
      if (await this.app.vault.adapter.exists(dirName)) {
        try {
          await this.app.vault.adapter.rmdir(dirName, false);
        } catch (e) {
          if (await this.app.vault.adapter.exists(dirName)) {
            throw e;
          }
        }
      }
    }
  }

  private async deleteFile(file: TFile, deleteEmptyFolders: boolean): Promise<void> {
    await this.app.vault.trash(file, true);
    if (deleteEmptyFolders) {
      let dir = file.parent!;
      while (dir.children.length === 0) {
        await this.app.vault.trash(dir, true);
        dir = dir.parent!;
      }
    }
  }

  private isAttachment(file: TFile): boolean {
    const extension = file.extension.toLowerCase();
    return extension !== "md" && extension !== "canvas";
  }
}
