import type { App } from 'obsidian';
import type { PathOrAbstractFile } from 'obsidian-dev-utils/obsidian/file-system';

import { TFile } from 'obsidian';
import {
  AttachmentPathContext,
  getAttachmentFilePath
} from 'obsidian-dev-utils/obsidian/attachment-path';
import { EmptyFolderBehavior } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import {
  getFileOrNull,
  getPath,
  isNote
} from 'obsidian-dev-utils/obsidian/file-system';
import {
  extractLinkFile,
  splitSubpath,
  testEmbed
} from 'obsidian-dev-utils/obsidian/link';
import {
  getAllLinks,
  getCacheSafe
} from 'obsidian-dev-utils/obsidian/metadata-cache';
import {
  copySafe,
  createFolderSafe,
  deleteEmptyFolderHierarchy,
  getAvailablePath,
  listSafe,
  renameSafe,
  trashSafe
} from 'obsidian-dev-utils/obsidian/vault';
import { deleteIfNotUsed } from 'obsidian-dev-utils/obsidian/vault-delete';
import { dirname } from 'obsidian-dev-utils/path';
import { trimStart } from 'obsidian-dev-utils/string';

import type { PathChangeInfo } from './links-handler.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { LinksHandler } from './links-handler.ts';

export interface MovedAttachmentResult {
  readonly movedAttachments: PathChangeInfo[];
}

interface FilesHandlerConstructorParams {
  readonly app: App;
  readonly linksHandler: LinksHandler;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class FilesHandler {
  private readonly app: App;
  private readonly linksHandler: LinksHandler;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: FilesHandlerConstructorParams) {
    this.app = params.app;
    this.linksHandler = params.linksHandler;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async collectAttachmentsForCachedNote(notePath: string): Promise<MovedAttachmentResult> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(notePath)) {
      return { movedAttachments: [] };
    }

    let result: MovedAttachmentResult = {
      movedAttachments: []
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

      const fullPathLink = this.linksHandler.getFullPathForLink(linkPath, notePath);
      if (result.movedAttachments.findIndex((x) => x.oldPath === fullPathLink) !== -1) {
        continue;
      }

      const file = extractLinkFile(this.app, link, notePath);
      if (!file) {
        const type = testEmbed(link.original) ? 'embed' : 'link';
        console.warn(`${notePath} has bad ${type} (file does not exist): ${linkPath}`);
        continue;
      }

      if (this.isNoteEx(file)) {
        continue;
      }

      if (this.pluginSettingsComponent.settings.isExcludedFromAttachmentCollecting(file.path)) {
        continue;
      }

      const newPath = await getAttachmentFilePath({
        app: this.app,
        context: 'consistent-attachments-and-links' as AttachmentPathContext,
        notePathOrFile: notePath,
        oldAttachmentPathOrFile: file,
        shouldSkipDuplicateCheck: true
      });

      if (dirname(newPath) === dirname(file.path)) {
        continue;
      }

      const res = await this.moveAttachment(file, newPath, [notePath]);

      result = {
        ...result,
        movedAttachments: result.movedAttachments.concat(res.movedAttachments)
      };
    }

    return result;
  }

  public async deleteEmptyFolders(dirName: string): Promise<void> {
    if (this.pluginSettingsComponent.settings.isPathIgnored(dirName)) {
      return;
    }

    dirName = trimStart(dirName, './');

    let list = await listSafe(this.app, dirName);
    for (const folder of list.folders) {
      await this.deleteEmptyFolders(folder);
    }

    list = await listSafe(this.app, dirName);
    if (list.files.length === 0 && list.folders.length === 0) {
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

  public isNoteEx(pathOrFile: null | PathOrAbstractFile): boolean {
    if (!pathOrFile || !isNote(this.app, pathOrFile)) {
      return false;
    }

    const path = getPath(this.app, pathOrFile);
    return this.pluginSettingsComponent.settings.treatAsAttachmentExtensions.every((extension) => !path.endsWith(extension));
  }

  private async createFolderForAttachmentFromPath(filePath: string): Promise<void> {
    await createFolderSafe(this.app, dirname(filePath));
  }

  private async deleteFile(file: TFile): Promise<void> {
    await trashSafe(this.app, file);
    if (!file.parent) {
      return;
    }
    switch (this.pluginSettingsComponent.settings.emptyFolderBehavior) {
      case EmptyFolderBehavior.Delete:
        await deleteIfNotUsed(this.app, file.parent, undefined, undefined, true);
        break;
      case EmptyFolderBehavior.DeleteWithEmptyParents:
        await deleteEmptyFolderHierarchy(this.app, file.parent);
        break;
      default:
        break;
    }
  }

  private async moveAttachment(
    file: TFile,
    newLinkPath: string,
    parentNotePaths: string[]
  ): Promise<MovedAttachmentResult> {
    const path = file.path;

    const result: MovedAttachmentResult = {
      movedAttachments: []
    };

    if (this.pluginSettingsComponent.settings.isPathIgnored(path)) {
      return result;
    }

    if (this.isNoteEx(file)) {
      return result;
    }

    if (path === newLinkPath) {
      console.warn('Can\'t move file. Source and destination path the same.');
      return result;
    }

    await this.createFolderForAttachmentFromPath(newLinkPath);

    const linkedNotes = await this.linksHandler.getCachedNotesThatHaveLinkToFile(path);
    for (const notePath of parentNotePaths) {
      linkedNotes.remove(notePath);
    }

    if (path !== file.path) {
      console.warn('File was moved already');
      return await this.moveAttachment(file, newLinkPath, parentNotePaths);
    }

    const oldFolder = file.parent;
    const isMove = linkedNotes.length === 0;
    const newLinkFile = getFileOrNull(this.app, newLinkPath);
    if (newLinkFile) {
      if (this.pluginSettingsComponent.settings.shouldDeleteExistingFilesWhenMovingNote) {
        await this.deleteFile(newLinkFile);
      } else {
        newLinkPath = getAvailablePath(this.app, newLinkPath);
      }
    }

    result.movedAttachments.push({ newPath: newLinkPath, oldPath: path });
    if (isMove) {
      await renameSafe(this.app, file, newLinkPath);
    } else {
      await copySafe(this.app, file, newLinkPath);
    }

    if (oldFolder) {
      switch (this.pluginSettingsComponent.settings.emptyFolderBehavior) {
        case EmptyFolderBehavior.Delete:
          await deleteIfNotUsed(this.app, oldFolder, undefined, undefined, true);
          break;
        case EmptyFolderBehavior.DeleteWithEmptyParents:
          await deleteEmptyFolderHierarchy(this.app, oldFolder);
          break;
        default:
          break;
      }
    }

    return result;
  }
}
