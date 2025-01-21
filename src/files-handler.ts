import { TFile } from 'obsidian';
import { getAttachmentFilePath } from 'obsidian-dev-utils/obsidian/AttachmentPath';
import {
  getFileOrNull,
  isNote
} from 'obsidian-dev-utils/obsidian/FileSystem';
import {
  extractLinkFile,
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
  getAvailablePath,
  listSafe,
  renameSafe
} from 'obsidian-dev-utils/obsidian/Vault';
import { deleteEmptyFolderHierarchy } from 'obsidian-dev-utils/obsidian/VaultEx';
import { dirname } from 'obsidian-dev-utils/Path';

import type { ConsistentAttachmentsAndLinksPlugin } from './ConsistentAttachmentsAndLinksPlugin.ts';
import type { PathChangeInfo } from './links-handler.ts';

import { LinksHandler } from './links-handler.ts';

export interface MovedAttachmentResult {
  movedAttachments: PathChangeInfo[];
  renamedFiles: PathChangeInfo[];
}

export class FilesHandler {
  public constructor(
    private plugin: ConsistentAttachmentsAndLinksPlugin,
    private lh: LinksHandler
  ) { }

  public async collectAttachmentsForCachedNote(notePath: string,
    deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {
    if (this.plugin.settingsCopy.isPathIgnored(notePath)) {
      return { movedAttachments: [], renamedFiles: [] };
    }

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    const cache = await getCacheSafe(this.plugin.app, notePath);

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

      const file = extractLinkFile(this.plugin.app, link, notePath);
      if (!file) {
        const type = testEmbed(link.original) ? 'embed' : 'link';
        console.warn(`${notePath} has bad ${type} (file does not exist): ${linkPath}`);
        continue;
      }

      if (!this.isAttachment(file)) {
        continue;
      }

      const newPath = await getAttachmentFilePath(this.plugin.app, file.path, notePath);

      if (dirname(newPath) === dirname(file.path)) {
        continue;
      }

      const res = await this.moveAttachment(file, newPath, [notePath], deleteExistFiles, deleteEmptyFolders);

      result.movedAttachments = result.movedAttachments.concat(res.movedAttachments);
      result.renamedFiles = result.renamedFiles.concat(res.renamedFiles);
    }

    return result;
  }

  public async deleteEmptyFolders(dirName: string): Promise<void> {
    if (this.plugin.settingsCopy.isPathIgnored(dirName)) {
      return;
    }

    if (dirName.startsWith('./')) {
      dirName = dirName.slice(2);
    }

    let list = await listSafe(this.plugin.app, dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await listSafe(this.plugin.app, dirName);
    if (list.files.length == 0 && list.folders.length == 0) {
      this.plugin.consoleDebug(`delete empty folder: \n   ${dirName}`);
      if (await this.plugin.app.vault.exists(dirName)) {
        try {
          await this.plugin.app.vault.adapter.rmdir(dirName, false);
        } catch (e) {
          if (await this.plugin.app.vault.adapter.exists(dirName)) {
            throw e;
          }
        }
      }
    }
  }

  private async createFolderForAttachmentFromPath(filePath: string): Promise<void> {
    await createFolderSafe(this.plugin.app, dirname(filePath));
  }

  private async deleteFile(file: TFile, deleteEmptyFolders: boolean): Promise<void> {
    await this.plugin.app.fileManager.trashFile(file);
    if (deleteEmptyFolders) {
      let dir = file.parent;
      while (dir && dir.children.length === 0) {
        await this.plugin.app.fileManager.trashFile(dir);
        dir = dir.parent;
      }
    }
  }

  private isAttachment(file: TFile): boolean {
    return !isNote(this.plugin.app, file);
  }

  private async moveAttachment(file: TFile, newLinkPath: string, parentNotePaths: string[], deleteExistFiles: boolean, deleteEmptyFolders: boolean): Promise<MovedAttachmentResult> {
    const path = file.path;

    const result: MovedAttachmentResult = {
      movedAttachments: [],
      renamedFiles: []
    };

    if (this.plugin.settingsCopy.isPathIgnored(path)) {
      return result;
    }

    if (!this.isAttachment(file)) {
      return result;
    }

    if (path == newLinkPath) {
      console.warn('Can\'t move file. Source and destination path the same.');
      return result;
    }

    await this.createFolderForAttachmentFromPath(newLinkPath);

    const linkedNotes = await this.lh.getCachedNotesThatHaveLinkToFile(path);
    for (const notePath of parentNotePaths) {
      linkedNotes.remove(notePath);
    }

    if (path !== file.path) {
      console.warn('File was moved already');
      return await this.moveAttachment(file, newLinkPath, parentNotePaths, deleteExistFiles, deleteEmptyFolders);
    }

    const oldFolder = file.parent;
    if (linkedNotes.length == 0) {
      const existFile = getFileOrNull(this.plugin.app, newLinkPath);
      if (!existFile) {
        this.plugin.consoleDebug('move file [from, to]: \n   ' + path + '\n   ' + newLinkPath);
        result.movedAttachments.push({ newPath: newLinkPath, oldPath: path });
        await renameSafe(this.plugin.app, file, newLinkPath);
      } else {
        if (deleteExistFiles) {
          this.plugin.consoleDebug('delete file: \n   ' + path);
          result.movedAttachments.push({ newPath: newLinkPath, oldPath: path });
          await this.deleteFile(file, deleteEmptyFolders);
        } else {
          const newFileCopyName = getAvailablePath(this.plugin.app, newLinkPath);
          this.plugin.consoleDebug('copy file with new name [from, to]: \n   ' + path + '\n   ' + newFileCopyName);
          result.movedAttachments.push({ newPath: newFileCopyName, oldPath: path });
          await renameSafe(this.plugin.app, file, newFileCopyName);
          result.renamedFiles.push({ newPath: newFileCopyName, oldPath: newLinkPath });
        }
      }
    } else {
      const existFile = getFileOrNull(this.plugin.app, newLinkPath);
      if (!existFile) {
        this.plugin.consoleDebug('copy file [from, to]: \n   ' + path + '\n   ' + newLinkPath);
        result.movedAttachments.push({ newPath: newLinkPath, oldPath: path });
        await renameSafe(this.plugin.app, file, newLinkPath);
        await copySafe(this.plugin.app, file, path);
      } else if (!deleteExistFiles) {
        const newFileCopyName = getAvailablePath(this.plugin.app, newLinkPath);
        this.plugin.consoleDebug('copy file with new name [from, to]: \n   ' + path + '\n   ' + newFileCopyName);
        result.movedAttachments.push({ newPath: newFileCopyName, oldPath: file.path });
        await renameSafe(this.plugin.app, file, newFileCopyName);
        await copySafe(this.plugin.app, file, path);
        result.renamedFiles.push({ newPath: newFileCopyName, oldPath: newLinkPath });
      }
    }

    if (this.plugin.settingsCopy.deleteEmptyFolders) {
      await deleteEmptyFolderHierarchy(this.plugin.app, oldFolder);
    }
    return result;
  }
}
