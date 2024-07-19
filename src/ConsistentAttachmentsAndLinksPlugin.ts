import {
  Plugin,
  TAbstractFile,
  TFile,
  Notice,
  Editor,
  MarkdownView,
  type CachedMetadata,
  type MarkdownFileInfo
} from "obsidian";
import { Utils } from "./utils.ts";
import {
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
      editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => this.collectAttachmentsCurrentNote(editor, view as MarkdownView)
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
    if (path.startsWith("./"))
      path = path.substring(2);

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
    if (this.isPathIgnored(file.path))
      return;

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
    this.timerId = setTimeout(() => { convertToSync(this.HandleRecentlyRenamedFiles()); }, 3000);
  }

  public async HandleRecentlyRenamedFiles(): Promise<void> {
    if (!this.recentlyRenamedFiles || this.recentlyRenamedFiles.length == 0) //nothing to rename
      return;

    if (this.renamingIsActive) //already started
      return;

    this.renamingIsActive = true;

    this.currentlyRenamingFiles = this.recentlyRenamedFiles; //clear array for pushing new files async
    this.recentlyRenamedFiles = [];

    new Notice("Fixing consistency for " + this.currentlyRenamingFiles.length + " renamed files" + "...");
    console.log("Consistent Attachments and Links:\nFixing consistency for " + this.currentlyRenamingFiles.length + " renamed files" + "...");

    try {
      for (const file of this.currentlyRenamingFiles) {
        if (this.isPathIgnored(file.newPath) || this.isPathIgnored(file.oldPath))
          return;

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
              await this.lh.updateInternalLinksInMovedNote(file.oldPath, file.newPath, this._settings.moveAttachmentsWithNote);
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
          await this.lh.updateLinksToRenamedFile(file.oldPath, file.newPath, updateAlts, this._settings.useBuiltInObsidianLinkCaching);
        }

        if (result && result.movedAttachments && result.movedAttachments.length > 0) {
          new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
        }
      }
    } catch (e) {
      console.error("Consistent Attachments and Links:", e);
    }

    new Notice("Fixing Consistency Complete");
    console.log("Consistent Attachments and Links:\nFixing consistency complete");

    this.renamingIsActive = false;

    if (this.recentlyRenamedFiles && this.recentlyRenamedFiles.length > 0) {
      clearTimeout(this.timerId);
      this.timerId = setTimeout(() => { convertToSync(this.HandleRecentlyRenamedFiles()); }, 500);
    }
  }


  public async collectAttachmentsCurrentNote(_: Editor, view: MarkdownView): Promise<void> {
    const note = view.file as TFile;
    if (this.isPathIgnored(note.path)) {
      new Notice("Note path is ignored");
      return;
    }

    const result = await this.fh.collectAttachmentsForCachedNote(
      note.path,
      this._settings.attachmentsSubfolder,
      this._settings.deleteExistFilesWhenMoveNote,
      this._settings.deleteEmptyFolders);

    if (result && result.movedAttachments && result.movedAttachments.length > 0) {
      await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments);
    }

    if (result.movedAttachments.length == 0)
      new Notice("No files found that need to be moved");
    else
      new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
  }


  public async collectAllAttachments(): Promise<void> {
    let movedAttachmentsCount = 0;
    let processedNotesCount = 0;

    const notes = this.app.vault.getMarkdownFiles();

    for (const note of notes) {
      if (this.isPathIgnored(note.path))
        continue;

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

    if (movedAttachmentsCount == 0)
      new Notice("No files found that need to be moved");
    else
      new Notice("Moved " + movedAttachmentsCount + " attachment" + (movedAttachmentsCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
  }


  public async convertAllEmbedsPathsToRelative(): Promise<void> {
    let changedEmbedCount = 0;
    let processedNotesCount = 0;

    const notes = this.app.vault.getMarkdownFiles();

    for (const note of notes) {
      if (this.isPathIgnored(note.path))
        continue;

      const result = await this.lh.convertAllNoteEmbedsPathsToRelative(note.path);

      if (result && result.length > 0) {
        changedEmbedCount += result.length;
        processedNotesCount++;
      }
    }

    if (changedEmbedCount == 0)
      new Notice("No embeds found that need to be converted");
    else
      new Notice("Converted " + changedEmbedCount + " embed" + (changedEmbedCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
  }


  public async convertAllLinkPathsToRelative(): Promise<void> {
    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = this.app.vault.getMarkdownFiles();

    for (const note of notes) {
      if (this.isPathIgnored(note.path))
        continue;

      const result = await this.lh.convertAllNoteLinksPathsToRelative(note.path);

      if (result && result.length > 0) {
        changedLinksCount += result.length;
        processedNotesCount++;
      }
    }

    if (changedLinksCount == 0)
      new Notice("No links found that need to be converted");
    else
      new Notice("Converted " + changedLinksCount + " link" + (changedLinksCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
  }

  public async replaceAllWikilinksWithMarkdownLinks(): Promise<void> {
    let changedLinksCount = 0;
    let processedNotesCount = 0;

    const notes = this.app.vault.getMarkdownFiles();

    for (const note of notes) {
      if (this.isPathIgnored(note.path))
        continue;

      const result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path);

      if (result && (result.links.length > 0 || result.embeds.length > 0)) {
        changedLinksCount += result.links.length;
        changedLinksCount += result.embeds.length;
        processedNotesCount++;
      }
    }

    if (changedLinksCount == 0)
      new Notice("No wiki links found that need to be replaced");
    else
      new Notice("Replaced " + changedLinksCount + " wikilink" + (changedLinksCount > 1 ? "s" : "")
        + " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
  }

  public async deleteEmptyFolders(): Promise<void> {
    await this.fh.deleteEmptyFolders("/");
  }

  public async checkConsistency(): Promise<void> {
    const badLinks = await this.lh.getAllBadLinks();
    const badEmbeds = await this.lh.getAllBadEmbeds();
    const wikiLinks = await this.lh.getAllWikiLinks();
    const wikiEmbeds = await this.lh.getAllWikiEmbeds();

    let text = "";

    const badLinksCount = Object.keys(badLinks).length;
    const badEmbedsCount = Object.keys(badEmbeds).length;
    const wikiLinksCount = Object.keys(wikiLinks).length;
    const wikiEmbedsCount = Object.keys(wikiEmbeds).length;

    if (badLinksCount > 0) {
      text += `# Bad links (${badLinksCount} files)\n`;
      for (const note in badLinks) {
        text += `[${note}](${Utils.normalizePathForLink(note)}): \n`;
        for (const link of badLinks[note]!) {
          text += `- (line ${link.position.start.line + 1}): \`${link.link}\`\n`;
        }
        text += "\n\n";
      }
    } else {
      text += "# Bad links \n";
      text += "No problems found\n\n";
    }

    if (badEmbedsCount > 0) {
      text += "\n\n# Bad embeds (" + badEmbedsCount + " files)\n";
      for (const note in badEmbeds) {
        text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n";
        for (const link of badEmbeds[note]!) {
          text += "- (line " + (link.position.start.line + 1) + "): `" + link.link + "`\n";
        }
        text += "\n\n";
      }
    } else {
      text += "\n\n# Bad embeds \n";
      text += "No problems found\n\n";
    }


    if (wikiLinksCount > 0) {
      text += "# Wiki links (" + wikiLinksCount + " files)\n";
      for (const note in wikiLinks) {
        text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n";
        for (const link of wikiLinks[note]!) {
          text += "- (line " + (link.position.start.line + 1) + "): `" + link.original + "`\n";
        }
        text += "\n\n";
      }
    } else {
      text += "# Wiki links \n";
      text += "No problems found\n\n";
    }

    if (wikiEmbedsCount > 0) {
      text += "\n\n# Wiki embeds (" + wikiEmbedsCount + " files)\n";
      for (const note in wikiEmbeds) {
        text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n";
        for (const link of wikiEmbeds[note]!) {
          text += "- (line " + (link.position.start.line + 1) + "): `" + link.original + "`\n";
        }
        text += "\n\n";
      }
    } else {
      text += "\n\n# Wiki embeds \n";
      text += "No problems found\n\n";
    }



    const notePath = this._settings.consistencyReportFile;
    await this.app.vault.adapter.write(notePath, text);

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
}
