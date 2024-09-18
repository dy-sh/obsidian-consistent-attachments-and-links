import {
  App,
  TFile
} from 'obsidian';
import { getAttachmentFilePath } from 'obsidian-dev-utils/obsidian/AttachmentPath';
import {
  getFileOrNull,
  isNote
} from 'obsidian-dev-utils/obsidian/FileSystem';
import {
  splitSubpath,
  testEmbed
} from 'obsidian-dev-utils/obsidian/Link';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/MetadataCache';
import {
  copySafe,
  createFolderSafe,
  deleteEmptyFolderHierarchy,
  getAvailablePath,
  listSafe,
  renameSafe
} from 'obsidian-dev-utils/obsidian/Vault';
import { dirname } from 'obsidian-dev-utils/Path';

import type { PathChangeInfo } from './links-handler.ts';
import { LinksHandler } from './links-handler.ts';

export interface MovedAttachmentResult {
  movedAttachments: PathChangeInfo[];
  renamedFiles: PathChangeInfo[];
}

export class FilesHandler {
  public constructor(
    private app: App,
    private lh: LinksHandler,
    private consoleLogPrefix = '',
    private ignoreFolders: string[] = [],
    private ignoreFilesRegex: RegExp[] = [],
    private shouldDeleteEmptyFolders = false
  ) { }

  private isPathIgnored(path: string): boolean {
    if (path.startsWith('./')) {
      path = path.substring(2);
    }

    for (const folder of this.ignoreFolders) {
      if (path.startsWith(folder)) {
        return true;
      }
    }

    for (const fileRegex of this.ignoreFilesRegex) {
      const testResult = fileRegex.test(path);
      if (testResult) {
        return true;
      }
    }

    return false;
  }

  private async createFolderForAttachmentFromPath(filePath: string): Promise<void> {
    await createFolderSafe(this.app, dirname(filePath));
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
      if (result.movedAttachments.findIndex((x) => x.oldPath == fullPathLink) != -1) {
        continue;
      }

      const file = this.lh.getFileByLink(linkPath, notePath);
      if (!file) {
        const type = testEmbed(link.original) ? 'embed' : 'link';
        console.warn(`${this.consoleLogPrefix}${notePath} has bad ${type} (file does not exist): ${linkPath}`);
        continue;
      }

      if (!this.isAttachment(file)) {
        continue;
      }

      const newPath = await getAttachmentFilePath(this.app, file.path, notePath);

      if (dirname(newPath) === dirname(file.path)) {
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
      console.warn(this.consoleLogPrefix + 'Can\'t move file. Source and destination path the same.');
      return result;
    }

    await this.createFolderForAttachmentFromPath(newLinkPath);

    const linkedNotes = await this.lh.getCachedNotesThatHaveLinkToFile(path);
    for (const notePath of parentNotePaths) {
      linkedNotes.remove(notePath);
    }

    if (path !== file.path) {
      console.warn(this.consoleLogPrefix + 'File was moved already');
      return await this.moveAttachment(file, newLinkPath, parentNotePaths, deleteExistFiles, deleteEmptyFolders);
    }

    const oldFolder = file.parent;
    if (linkedNotes.length == 0) {
      const existFile = getFileOrNull(this.app, newLinkPath);
      if (!existFile) {
        console.log(this.consoleLogPrefix + 'move file [from, to]: \n   ' + path + '\n   ' + newLinkPath);
        result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
        await renameSafe(this.app, file, newLinkPath);
      } else {
        if (deleteExistFiles) {
          console.log(this.consoleLogPrefix + 'delete file: \n   ' + path);
          result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
          await this.deleteFile(file, deleteEmptyFolders);
        } else {
          const newFileCopyName = getAvailablePath(this.app, newLinkPath);
          console.log(this.consoleLogPrefix + 'copy file with new name [from, to]: \n   ' + path + '\n   ' + newFileCopyName);
          result.movedAttachments.push({ oldPath: path, newPath: newFileCopyName });
          await renameSafe(this.app, file, newFileCopyName);
          result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName });
        }
      }
    } else {
      const existFile = getFileOrNull(this.app, newLinkPath);
      if (!existFile) {
        console.log(this.consoleLogPrefix + 'copy file [from, to]: \n   ' + path + '\n   ' + newLinkPath);
        result.movedAttachments.push({ oldPath: path, newPath: newLinkPath });
        await renameSafe(this.app, file, newLinkPath);
        await copySafe(this.app, file, path);
      } else if (!deleteExistFiles) {
        const newFileCopyName = getAvailablePath(this.app, newLinkPath);
        console.log(this.consoleLogPrefix + 'copy file with new name [from, to]: \n   ' + path + '\n   ' + newFileCopyName);
        result.movedAttachments.push({ oldPath: file.path, newPath: newFileCopyName });
        await renameSafe(this.app, file, newFileCopyName);
        await copySafe(this.app, file, path);
        result.renamedFiles.push({ oldPath: newLinkPath, newPath: newFileCopyName });
      }
    }

    if (this.shouldDeleteEmptyFolders) {
      await deleteEmptyFolderHierarchy(this.app, oldFolder);
    }
    return result;
  }

  public async deleteEmptyFolders(dirName: string): Promise<void> {
    if (this.isPathIgnored(dirName)) {
      return;
    }

    if (dirName.startsWith('./')) {
      dirName = dirName.substring(2);
    }

    let list = await listSafe(this.app, dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await listSafe(this.app, dirName);
    if (list.files.length == 0 && list.folders.length == 0) {
      console.log(this.consoleLogPrefix + 'delete empty folder: \n   ' + dirName);
      if (await this.app.vault.exists(dirName)) {
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
    await this.app.fileManager.trashFile(file);
    if (deleteEmptyFolders) {
      let dir = file.parent;
      while (dir && dir.children.length === 0) {
        await this.app.fileManager.trashFile(dir);
        dir = dir.parent;
      }
    }
  }

  private isAttachment(file: TFile): boolean {
    return !isNote(file);
  }
}
