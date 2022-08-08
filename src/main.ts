import { App, Plugin, TAbstractFile, TFile, EmbedCache, LinkCache, Notice, Editor, MarkdownView } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, SettingTab } from './settings';
import { Utils } from './utils';
import { LinksHandler, PathChangeInfo } from './links-handler';
import { FilesHandler, MovedAttachmentResult } from './files-handler';
import { path } from './path';




export default class ConsistentAttachmentsAndLinks extends Plugin {
	settings: PluginSettings;
	lh: LinksHandler;
	fh: FilesHandler;

	recentlyRenamedFiles: PathChangeInfo[] = [];
	currentlyRenamingFiles: PathChangeInfo[] = [];
	timerId: NodeJS.Timeout;
	renamingIsActive = false;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on('delete', (file) => this.handleDeletedFile(file)),
		);

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => this.handleRenamedFile(file, oldPath)),
		);

		this.addCommand({
			id: 'collect-all-attachments',
			name: 'Collect all attachments',
			callback: () => this.collectAllAttachments()
		});

		this.addCommand({
			id: 'collect-attachments-current-note',
			name: 'Collect attachments in current note',
			editorCallback: (editor: Editor, view: MarkdownView) => this.collectAttachmentsCurrentNote(editor, view)
		});

		this.addCommand({
			id: 'delete-empty-folders',
			name: 'Delete empty folders',
			callback: () => this.deleteEmptyFolders()
		});

		this.addCommand({
			id: 'convert-all-link-paths-to-relative',
			name: 'Convert all link paths to relative',
			callback: () => this.convertAllLinkPathsToRelative()
		});

		this.addCommand({
			id: 'convert-all-embed-paths-to-relative',
			name: 'Convert all embed paths to relative',
			callback: () => this.convertAllEmbedsPathsToRelative()
		});

		this.addCommand({
			id: 'replace-all-wikilinks-with-markdown-links',
			name: 'Replace all wikilinks with markdown links',
			callback: () => this.replaceAllWikilinksWithMarkdownLinks()
		});

		this.addCommand({
			id: 'reorganize-vault',
			name: 'Reorganize vault',
			callback: () => this.reorganizeVault()
		});

		this.addCommand({
			id: 'check-consistent',
			name: 'Check vault consistent',
			callback: () => this.checkConsistent()
		});

		// make regex from given strings 
		this.settings.ignoreFilesRegex = this.settings.ignoreFiles.map(val=>RegExp(val))

		this.lh = new LinksHandler(
			this.app,
			"Consistent attachments and links: ",
			this.settings.ignoreFolders,
			this.settings.ignoreFilesRegex
		);

		this.fh = new FilesHandler(
			this.app,
			this.lh,
			"Consistent attachments and links: ",
			this.settings.ignoreFolders,
			this.settings.ignoreFilesRegex
		);
	}

	isPathIgnored(path: string): boolean {
		if (path.startsWith("./"))
			path = path.substring(2);

		for (let folder of this.settings.ignoreFolders) {
			if (path.startsWith(folder)) {
				return true;
			}
		}

		for (let fileRegex of this.settings.ignoreFilesRegex) {
			if (fileRegex.test(path)) {
				return true;
			}
		}
	}


	async handleDeletedFile(file: TAbstractFile) {
		if (this.isPathIgnored(file.path))
			return;

		let fileExt = file.path.substring(file.path.lastIndexOf("."));
		if (fileExt == ".md") {
			if (this.settings.deleteAttachmentsWithNote) {
				await this.fh.deleteUnusedAttachmentsForCachedNote(file.path);
			}

			//delete child folders (do not delete parent)
			if (this.settings.deleteEmptyFolders) {
				if (await this.app.vault.adapter.exists(path.dirname(file.path))) {
					let list = await this.app.vault.adapter.list(path.dirname(file.path));
					for (let folder of list.folders) {
						await this.fh.deleteEmptyFolders(folder);
					}
				}
			}
		}
	}

	async handleRenamedFile(file: TAbstractFile, oldPath: string) {
		this.recentlyRenamedFiles.push({ oldPath: oldPath, newPath: file.path });

		clearTimeout(this.timerId);
		this.timerId = setTimeout(() => { this.HandleRecentlyRenamedFiles() }, 3000);
	}

	async HandleRecentlyRenamedFiles() {
		if (!this.recentlyRenamedFiles || this.recentlyRenamedFiles.length == 0) //nothing to rename
			return;

		if (this.renamingIsActive) //already started
			return;

		this.renamingIsActive = true;

		this.currentlyRenamingFiles = this.recentlyRenamedFiles; //clear array for pushing new files async
		this.recentlyRenamedFiles = [];

		new Notice("Fixing consistent for " + this.currentlyRenamingFiles.length + " renamed files" + "...");
		console.log("Consistent attachments and links:\nFixing consistent for " + this.currentlyRenamingFiles.length + " renamed files" + "...");

		try {
			for (let file of this.currentlyRenamingFiles) {
				if (this.isPathIgnored(file.newPath) || this.isPathIgnored(file.oldPath))
					return;

				// await Utils.delay(10); //waiting for update vault

				let result: MovedAttachmentResult;

				let fileExt = file.oldPath.substring(file.oldPath.lastIndexOf("."));

				if (fileExt == ".md") {
					// await Utils.delay(500);//waiting for update metadataCache

					if ((path.dirname(file.oldPath) != path.dirname(file.newPath)) || (this.settings.attachmentsSubfolder.contains("${filename}"))) {
						if (this.settings.moveAttachmentsWithNote) {
							result = await this.fh.moveCachedNoteAttachments(
								file.oldPath,
								file.newPath,
								this.settings.deleteExistFilesWhenMoveNote,
								this.settings.attachmentsSubfolder
							)

							if (this.settings.updateLinks && result) {
								let changedFiles = result.renamedFiles.concat(result.movedAttachments);
								if (changedFiles.length > 0) {
									await this.lh.updateChangedPathsInNote(file.newPath, changedFiles)
								}
							}
						}

						if (this.settings.updateLinks) {
							await this.lh.updateInternalLinksInMovedNote(file.oldPath, file.newPath, this.settings.moveAttachmentsWithNote)
						}

						//delete child folders (do not delete parent)
						if (this.settings.deleteEmptyFolders) {
							if (await this.app.vault.adapter.exists(path.dirname(file.oldPath))) {
								let list = await this.app.vault.adapter.list(path.dirname(file.oldPath));
								for (let folder of list.folders) {
									await this.fh.deleteEmptyFolders(folder);
								}
							}
						}
					}
				}

				let updateAlts = this.settings.changeNoteBacklinksAlt && fileExt == ".md";
				if (this.settings.updateLinks) {
					await this.lh.updateLinksToRenamedFile(file.oldPath, file.newPath, updateAlts, this.settings.useBuiltInObsidianLinkCaching);
				}

				if (result && result.movedAttachments && result.movedAttachments.length > 0) {
					new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
				}
			}
		} catch (e) {
			console.error("Consistent attachments and links: \n" + e);
		}

		new Notice("Fixing consistent complete");
		console.log("Consistent attachments and links:\nFixing consistent complete");

		this.renamingIsActive = false;

		if (this.recentlyRenamedFiles && this.recentlyRenamedFiles.length > 0) {
			clearTimeout(this.timerId);
			this.timerId = setTimeout(() => { this.HandleRecentlyRenamedFiles() }, 500);
		}
	}


	async collectAttachmentsCurrentNote(editor: Editor, view: MarkdownView) {
		let note = view.file;
		if (this.isPathIgnored(note.path)) {
			new Notice("Note path is ignored");
			return;
		}

		let result = await this.fh.collectAttachmentsForCachedNote(
			note.path,
			this.settings.attachmentsSubfolder,
			this.settings.deleteExistFilesWhenMoveNote);

		if (result && result.movedAttachments && result.movedAttachments.length > 0) {
			await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments)
		}

		if (result.movedAttachments.length == 0)
			new Notice("No files found that need to be moved");
		else
			new Notice("Moved " + result.movedAttachments.length + " attachment" + (result.movedAttachments.length > 1 ? "s" : ""));
	}


	async collectAllAttachments() {
		let movedAttachmentsCount = 0;
		let processedNotesCount = 0;

		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				let result = await this.fh.collectAttachmentsForCachedNote(
					note.path,
					this.settings.attachmentsSubfolder,
					this.settings.deleteExistFilesWhenMoveNote);


				if (result && result.movedAttachments && result.movedAttachments.length > 0) {
					await this.lh.updateChangedPathsInNote(note.path, result.movedAttachments)
					movedAttachmentsCount += result.movedAttachments.length;
					processedNotesCount++;
				}
			}
		}

		if (movedAttachmentsCount == 0)
			new Notice("No files found that need to be moved");
		else
			new Notice("Moved " + movedAttachmentsCount + " attachment" + (movedAttachmentsCount > 1 ? "s" : "")
				+ " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
	}


	async convertAllEmbedsPathsToRelative() {
		let changedEmbedCount = 0;
		let processedNotesCount = 0;

		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				let result = await this.lh.convertAllNoteEmbedsPathsToRelative(note.path);

				if (result && result.length > 0) {
					changedEmbedCount += result.length;
					processedNotesCount++;
				}
			}
		}

		if (changedEmbedCount == 0)
			new Notice("No embeds found that need to be converted");
		else
			new Notice("Converted " + changedEmbedCount + " embed" + (changedEmbedCount > 1 ? "s" : "")
				+ " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
	}


	async convertAllLinkPathsToRelative() {
		let changedLinksCount = 0;
		let processedNotesCount = 0;

		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				let result = await this.lh.convertAllNoteLinksPathsToRelative(note.path);

				if (result && result.length > 0) {
					changedLinksCount += result.length;
					processedNotesCount++;
				}
			}
		}

		if (changedLinksCount == 0)
			new Notice("No links found that need to be converted");
		else
			new Notice("Converted " + changedLinksCount + " link" + (changedLinksCount > 1 ? "s" : "")
				+ " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
	}

	async replaceAllWikilinksWithMarkdownLinks() {
		let changedLinksCount = 0;
		let processedNotesCount = 0;

		let notes = this.app.vault.getMarkdownFiles();

		if (notes) {
			for (let note of notes) {
				if (this.isPathIgnored(note.path))
					continue;

				let result = await this.lh.replaceAllNoteWikilinksWithMarkdownLinks(note.path);

				if (result && (result.links.length > 0 || result.embeds.length > 0)) {
					changedLinksCount += result.links.length;
					changedLinksCount += result.embeds.length;
					processedNotesCount++;
				}
			}
		}

		if (changedLinksCount == 0)
			new Notice("No wikilinks found that need to be replaced");
		else
			new Notice("Replaced " + changedLinksCount + " wikilink" + (changedLinksCount > 1 ? "s" : "")
				+ " from " + processedNotesCount + " note" + (processedNotesCount > 1 ? "s" : ""));
	}

	deleteEmptyFolders() {
		this.fh.deleteEmptyFolders("/")
	}

	async checkConsistent() {
		let badLinks = this.lh.getAllBadLinks();
		let badSectionLinks = await this.lh.getAllBadSectionLinks();
		let badEmbeds = this.lh.getAllBadEmbeds();
		let wikiLinks = this.lh.getAllWikiLinks();
		let wikiEmbeds = this.lh.getAllWikiEmbeds();

		let text = "";

		let badLinksCount = Object.keys(badLinks).length;
		let badEmbedsCount = Object.keys(badEmbeds).length;
		let badSectionLinksCount = Object.keys(badSectionLinks).length;
		let wikiLinksCount = Object.keys(wikiLinks).length;
		let wikiEmbedsCount = Object.keys(wikiEmbeds).length;

		if (badLinksCount > 0) {
			text += "# Bad links (" + badLinksCount + " files)\n";
			for (let note in badLinks) {
				text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n"
				for (let link of badLinks[note]) {
					text += "- (line " + link.position.start.line + "): `" + link.link + "`\n";
				}
				text += "\n\n"
			}
		} else {
			text += "# Bad links \n";
			text += "No problems found\n\n"
		}


		if (badSectionLinksCount > 0) {
			text += "\n\n# Bad note link sections (" + badSectionLinksCount + " files)\n";
			for (let note in badSectionLinks) {
				text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n"
				for (let link of badSectionLinks[note]) {
					let li = this.lh.splitLinkToPathAndSection(link.link);
					let section = Utils.normalizeLinkSection(li.section);
					text += "- (line " + link.position.start.line + "): `" + li.link + "#" + section + "`\n";
				}
				text += "\n\n"
			}
		} else {
			text += "\n\n# Bad note link sections\n"
			text += "No problems found\n\n"
		}


		if (badEmbedsCount > 0) {
			text += "\n\n# Bad embeds (" + badEmbedsCount + " files)\n";
			for (let note in badEmbeds) {
				text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n"
				for (let link of badEmbeds[note]) {
					text += "- (line " + link.position.start.line + "): `" + link.link + "`\n";
				}
				text += "\n\n"
			}
		} else {
			text += "\n\n# Bad embeds \n";
			text += "No problems found\n\n"
		}


		if (wikiLinksCount > 0) {
			text += "# Wiki links (" + wikiLinksCount + " files)\n";
			for (let note in wikiLinks) {
				text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n"
				for (let link of wikiLinks[note]) {
					text += "- (line " + link.position.start.line + "): `" + link.original + "`\n";
				}
				text += "\n\n"
			}
		} else {
			text += "# Wiki links \n";
			text += "No problems found\n\n"
		}

		if (wikiEmbedsCount > 0) {
			text += "\n\n# Wiki embeds (" + wikiEmbedsCount + " files)\n";
			for (let note in wikiEmbeds) {
				text += "[" + note + "](" + Utils.normalizePathForLink(note) + "): " + "\n"
				for (let link of wikiEmbeds[note]) {
					text += "- (line " + link.position.start.line + "): `" + link.original + "`\n";
				}
				text += "\n\n"
			}
		} else {
			text += "\n\n# Wiki embeds \n";
			text += "No problems found\n\n"
		}



		let notePath = this.settings.consistentReportFile;
		await this.app.vault.adapter.write(notePath, text);

		let fileOpened = false;
		this.app.workspace.iterateAllLeaves(leaf => {
			if (leaf.getDisplayText() != "" && notePath.startsWith(leaf.getDisplayText())) {
				fileOpened = true;
			}
		});

		if (!fileOpened)
			this.app.workspace.openLinkText(notePath, "/", false);
	}

	async reorganizeVault() {
		await this.replaceAllWikilinksWithMarkdownLinks()
		await this.convertAllEmbedsPathsToRelative()
		await this.convertAllLinkPathsToRelative()
		//- Rename all attachments (using Unique attachments, optional)
		await this.collectAllAttachments()
		await this.deleteEmptyFolders()
		new Notice("Reorganization of the vault completed");
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		this.lh = new LinksHandler(
			this.app,
			"Consistent attachments and links: ",
			this.settings.ignoreFolders,
			this.settings.ignoreFilesRegex
		);

		this.fh = new FilesHandler(
			this.app,
			this.lh,
			"Consistent attachments and links: ",
			this.settings.ignoreFolders,
			this.settings.ignoreFilesRegex,
		);
	}


}




