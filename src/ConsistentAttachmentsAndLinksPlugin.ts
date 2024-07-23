import {
  Plugin,
  TAbstractFile,
  TFile,
  Notice,
  type CachedMetadata,
  MarkdownView,
} from "obsidian";
import {
  ConsistencyCheckResult,
  LinksHandler,
  type PathChangeInfo
} from "./links-handler.ts";
import {
  FilesHandler,
  type MovedAttachmentResult
} from "./files-handler.ts";
import { convertToSync } from "./Async.ts";
import { ConsistentAttachmentsAndLinksPluginSettingsTab } from "./ConsistentAttachmentsAndLinksPluginSettingsTab.ts";
import ConsistentAttachmentsAndLinksPluginSettings from "./ConsistentAttachmentsAndLinksPluginSettings.ts";
import { dirname } from "node:path/posix";
import { getMarkdownFilesSorted } from "./Vault.ts";
import { showError } from "./Error.ts";

export default class ConsistentAttachmentsAndLinksPlugin extends Plugin {
  private _settings!: ConsistentAttachmentsAndLinksPluginSettings;
  private lh!: LinksHandler;
  private fh!: FilesHandler;

  private recentlyRenamedFiles: PathChangeInfo[] = [];
  private currentlyRenamingFiles: PathChangeInfo[] = [];
  private timerId!: NodeJS.Timeout;
  private renamingIsActive = false;

  private deletedNoteCache: Map<string, CachedMetadata> = new Map<string, CachedMetadata>();

  public get settings(): ConsistentAttachmentsAndLinksPluginSettings {
    return ConsistentAttachmentsAndLinksPluginSettings.clone(this._settings);
  }

  public override async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new ConsistentAttachmentsAndLinksPluginSettingsTab(this.app, this));

    this.registerEvent(
      this.app.metadataCache.on("deleted", (file, prevCache) => this.handleDeletedMetadata(file, prevCache!)),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => convertToSync(this.handleDeletedFile(file))),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => this.handleRenamedFile(file, oldPath)),
    );

    this.addCommand({
      id: "collect-all-attachments",
      name: "Collect All Attachments",
      callback: () => this.collectAllAttachments()
    });

    this.addCommand({
      id: "collect-attachments-current-note",
      name: "Collect Attachments in Current Note",
      checkCallback: this.collectAttachmentsCurrentNote.bind(this)
    });

    this.addCommand({
      id: "delete-empty-folders",
      name: "Delete Empty Folders",
      callback: () => this.deleteEmptyFolders()
    });

    this.addCommand({
      id: "convert-all-link-paths-to-relative",
      name: "Convert All Link Paths to Relative",
      callback: () => this.convertAllLinkPathsToRelative()
    });

    this.addCommand({
      id: "convert-all-embed-paths-to-relative",
      name: "Convert All Embed Paths to Relative",
      callback: () => this.convertAllEmbedsPathsToRelative()
    });

    this.addCommand({
      id: "replace-all-wikilinks-with-markdown-links",
      name: "Replace All Wiki Links with Markdown Links",
      callback: () => this.replaceAllWikilinksWithMarkdownLinks()
    });

    this.addCommand({
      id: "reorganize-vault",
      name: "Reorganize Vault",
      callback: () => this.reorganizeVault()
    });

    this.addCommand({
      id: "check-consistency",
      name: "Check Vault consistency",
      callback: () => this.checkConsistency()
    });

    this.lh = new LinksHandler(
      this.app,
      "Consistent Attachments and Links: ",
      this._settings.ignoreFolders,
      this._settings.getIgnoreFilesRegex()
    );

    this.fh = new FilesHandler(
      this.app,
      this.lh,
      "Consistent Attachments and Links: ",
      this._settings.ignoreFolders,
      this._settings.getIgnoreFilesRegex()
    );
  }

  public isPathIgnored(path: string): boolean {
    if (path.startsWith("./")) {
      path = path.substring(2);
    }

    for (const folder of this._settings.ignoreFolders) {
      if (path.startsWith(folder)) {
        return true;
      }
    }

    for (const fileRegex of this._settings.getIgnoreFilesRegex()) {
      if (fileRegex.test(path)) {
        return true;
      }
    }

    return false;
  }

  public handleDeletedMetadata(file: TFile, prevCache: CachedMetadata): void {
    if (!prevCache || !this._settings.deleteAttachmentsWithNote || this.isPathIgnored(file.path) || file.extension.toLowerCase() !== "md") {
      return;
    }

    this.deletedNoteCache.set(file.path, prevCache);
  }

  public async handleDeletedFile(file: TAbstractFile): Promise<void> {
    if (this.isPathIgnored(file.path)) {
      return;
    }

    await this.saveAllOpenNotes();

    const fileExt = file.path.substring(file.path.lastIndexOf("."));
    if (fileExt == ".md") {
      if (this._settings.deleteAttachmentsWithNote) {
        const cache = this.deletedNoteCache.get(file.path);

        if (!cache) {
          await sleep(100);
          await this.handleDeletedFile(file);
          return;
        }

        this.deletedNoteCache.delete(file.path);
        await this.fh.deleteUnusedAttachmentsForCachedNote(file.path, cache, this._settings.deleteEmptyFolders);
      }

      //delete child folders (do not delete parent)
      if (this._settings.deleteEmptyFolders) {
        if (await this.app.vault.adapter.exists(dirname(file.path))) {
          const list = await this.app.vault.adapter.list(dirname(file.path));
          for (const folder of list.folders) {
            await this.fh.deleteEmptyFolders(folder);
          }
        }
      }
    }
  }

  public handleRenamedFile(file: TAbstractFile, oldPath: string): void {
    this.recentlyRenamedFiles.push({ oldPath: oldPath, newPath: file.path });

    clearTimeout(this.timerId);
    this.timerId = setTimeout(() => {
      convertToSync(this.HandleRecentlyRenamedFiles());
    }, 3000);
  }

  public async HandleRecentlyRenamedFiles(): Promise<void> {
    if (!this.recentlyRenamedFiles || this.recentlyRenamedFiles.length == 0) {
      //nothing to rename
      return;
    }

    if (this.renamingIsActive) {
      //already started
      return;
    }

    this.renamingIsActive = true;

    this.currentlyRenamingFiles = this.recentlyRenamedFiles; //clear array for pushing new files async
    this.recentlyRenamedFiles = [];

    await this.saveAllOpenNotes();

    new Notice("Fixing consistency for " + this.currentlyRenamingFiles.length + " renamed files" + "...");
    console.log("Consistent Attachments and Links:\nFixing consistency for " + this.currentlyRenamingFiles.length + " renamed files" + "...");

    try {
      for (const file of this.currentlyRenamingFiles) {
        if (this.isPathIgnored(file.newPath) || this.isPathIgnored(file.oldPath)) {
          return;
        }

        // await Utils.delay(10); //waiting for update vault

        let result: MovedAttachmentResult | null = null;

        const fileExt = file.oldPath.substring(file.oldPath.lastIndexOf("."));

        if (fileExt == ".md") {
          // await Utils.delay(500);//waiting for update metadataCache

          if ((dirname(file.oldPath) != dirname(file.newPath)) || (this._settings.attachmentsSubfolder.contains("${filename}"))) {
            if (this._settings.moveAttachmentsWithNote) {
              result = await this.fh.moveCachedNoteAttachments(
                file.oldPath,
                file.newPath,
                this._settings.deleteExistFilesWhenMoveNote,
                this._settings.attachmentsSubfolder,
                this._settings.deleteEmptyFolders
              );

              if (this._settings.updateLinks && result) {
                const changedFiles = result.renamedFiles.concat(result.movedAttachments);
                if (changedFiles.length > 0) {
                  await this.lh.updateChangedPathsInNote(file.newPath, changedFiles);
                }
              }
            }

            if (this._settings.updateLinks) {
              await this.lh.updateInternalLinksInMovedNote(file.oldPath, file.newPath);
            }

            //delete child folders (do not delete parent)
            if (this._settings.deleteEmptyFolders) {
              if (await this.app.vault.adapter.exists(dirname(file.oldPath))) {
                const list = await this.app.vault.adapter.list(dirname(file.oldPath));
                for (const folder of list.folders) {
                  await this.fh.deleteEmptyFolders(folder);
                }
              }
            }
          }
        }

        const updateAlts = this._settings.changeNoteBacklinksAlt && fileExt == ".md";
        if (this._settings.updateLinks) {
          await this.lh.updateLinksToRenamedFile(file.oldPath, file.newPath, updateAlts);
        }

        if (result && result.movedAttachments && result.movedAttachments.length > 0) {
          new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
        }
      }
    } catch (e) {
      showError(e);
    }

    new Notice("Fixing Consistency Complete");
    console.log("Consistent Attachments and Links:\nFixing consistency complete");

    this.renamingIsActive = false;

    if (this.recentlyRenamedFiles && this.recentlyRenamedFiles.length > 0) {
      clearTimeout(this.timerId);
      this.timerId = setTimeout(() => {
        convertToSync(this.HandleRecentlyRenamedFiles());
      }, 500);
    }
  }

  public collectAttachmentsCurrentNote(checking: boolean): boolean {
    const note = this.app.workspace.getActiveFile();
    if (!note || note.extension.toLowerCase() !== "md") {
      return false;
    }

    if (!checking) {
      convertToSync(this.collectAttachments(note));
    }

    return true;
  }

  private async collectAttachments(note: TFile): Promise<void> {
    if (this.isPathIgnored(note.path)) {
      new Notice("Note path is ignored");
      return;
    }

    await this.saveAllOpenNotes();

    const result = await this.fh.collectAttachmentsForCachedNote(
      note.path,
      this._settings.attachmentsSubfolder,
      this._settings.deleteExistFilesWhenMoveNote,
      this._settings.deleteEmptyFolders);

    if (result && result.movedAttachments && result.movedAttachments.length > 0) {
      await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
    }

    if (result.movedAttachments.length == 0) {
      new Notice("No files found that need to be moved");
    } else {
      new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
    }
  }

  public async collectAllAttachments(): Promise<void> {
    let movedAttachmentsCount = 0;
    let processedNotesCount = 0;

    await this.saveAllOpenNotes();

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Collecting attachments # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.fh.collectAttachmentsForCachedNote(
        note.path,
        this._settings.attachmentsSubfolder,
        this._settings.deleteExistFilesWhenMoveNote,
        this._settings.deleteEmptyFolders);


      if (result && result.movedAttachments && result.movedAttachments.length > 0) {
        await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
        movedAttachmentsCount += result.movedAttachments.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (movedAttachmentsCount == 0) {
      new Notice("No files found that need to be moved");
    } else {
      new Notice("Moved " + movedAttachmentsCount + " attachment" + (movedAttachmentsCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
    }
  }


  public async convertAllEmbedsPathsToRelative(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedEmbedCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Converting embed paths to relative # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.convertAllNoteEmbedsPathsToRelative(note.path);

      if (result && result.length > 0) {
        changedEmbedCount += result.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (changedEmbedCount == 0) {
      new Notice("No embeds found that need to be converted");
    } else {
      new Notice("Converted " + changedEmbedCount + " embed" + (changedEmbedCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
    }
  }


  public async convertAllLinkPathsToRelative(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Converting link paths to relative # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.convertAllNoteLinksPathsToRelative(note.path);

      if (result && result.length > 0) {
        changedLinksCount += result.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (changedLinksCount == 0) {
      new Notice("No links found that need to be converted");
    } else {
      new Notice("Converted " + changedLinksCount + " link" + (changedLinksCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
    }
  }

  public async replaceAllWikilinksWithMarkdownLinks(): Promise<void> {
    await this.saveAllOpenNotes();

    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Replacing wikilinks with markdown links # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      if (this.isPathIgnored(note.path)) {
        continue;
      }

      const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path);

      if (result && (result.links.length > 0 || result.embeds.length > 0)) {
        changedLinksCount += result.links.length;
        changedLinksCount += result.embeds.length;
        processedNotesCount++;
      }
    }

    notice.hide();

    if (changedLinksCount == 0) {
      new Notice("No wiki links found that need to be replaced");
    } else {
      new Notice("Replaced " + changedLinksCount + " wikilink" + (changedLinksCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
    }
  }

  public async deleteEmptyFolders(): Promise<void> {
    await this.fh.deleteEmptyFolders("/");
  }

  public async checkConsistency(): Promise<void> {
    await this.saveAllOpenNotes();

    const badLinks = new ConsistencyCheckResult("Bad links");
    const badEmbeds = new ConsistencyCheckResult("Bad embeds");
    const wikiLinks = new ConsistencyCheckResult("Wiki links");
    const wikiEmbeds = new ConsistencyCheckResult("Wiki embeds");

    const notes = getMarkdownFilesSorted(this.app);
    let i = 0;
    const notice = new Notice("", 0);
    for (const note of notes) {
      i++;
      const message = `Checking note # ${i} / ${notes.length} - ${note.path}`;
      notice.setMessage(message);
      console.debug(message);
      await this.lh.checkConsistency(note, badLinks, badEmbeds, wikiLinks, wikiEmbeds);
    }

    notice.hide();

    const text = badLinks.toString() + badEmbeds.toString() + wikiLinks.toString() + wikiEmbeds.toString();
    const notePath = this._settings.consistencyReportFile;
    const note = this.app.vault.getFileByPath(notePath) ?? await this.app.vault.create(notePath, "");
    await this.app.vault.modify(note, text);

    let fileOpened = false;
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.getDisplayText() != "" && notePath.startsWith(leaf.getDisplayText())) {
        fileOpened = true;
      }
    });

    if (!fileOpened) {
      await this.app.workspace.openLinkText(notePath, "/", false);
    }
  }

  public async reorganizeVault(): Promise<void> {
    await this.saveAllOpenNotes();

    await this.replaceAllWikilinksWithMarkdownLinks();
    await this.convertAllEmbedsPathsToRelative();
    await this.convertAllLinkPathsToRelative();
    //- Rename all attachments (using Unique attachments, optional)
    await this.collectAllAttachments();
    await this.deleteEmptyFolders();
    new Notice("Reorganization of the vault completed");
  }

  public async loadSettings(): Promise<void> {
    this._settings = ConsistentAttachmentsAndLinksPluginSettings.load(await this.loadData());
  }

  public async saveSettings(newSettings: ConsistentAttachmentsAndLinksPluginSettings): Promise<void> {
    this._settings = ConsistentAttachmentsAndLinksPluginSettings.clone(newSettings);
    await this.saveData(this._settings);

    this.lh = new LinksHandler(
      this.app,
      "Consistent Attachments and Links: ",
      this._settings.ignoreFolders,
      this._settings.getIgnoreFilesRegex()
    );

    this.fh = new FilesHandler(
      this.app,
      this.lh,
      "Consistent Attachments and Links: ",
      this._settings.ignoreFolders,
      this._settings.getIgnoreFilesRegex(),
    );
  }

  private async saveAllOpenNotes(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view as MarkdownView;
      await view.save();
    }
  }
}
