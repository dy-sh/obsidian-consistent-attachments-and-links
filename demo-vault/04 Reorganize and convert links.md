# Reorganize and convert links

The plugin's headline bulk feature tidies a vault in one pass: every attachment beside the note that uses it, the empty folders that leaves swept up, and every name repaired that a platform you sync to would reject. You can run the steps individually or all at once.

> [!WARNING]
>
> These commands change files across the vault. Back up a real vault first. This demo vault is safe to experiment in.

<!-- Separates the two callouts; without it markdownlint reads them as one blockquote. -->

> [!NOTE] Rewriting links is a different plugin's job
>
> This plugin used to have `Replace All Wiki Links with Markdown Links` and `Convert All Link Paths to Relative`, and three siblings each, because it was built to force a vault's migration to relative Markdown links. It no longer does that: it **reports** a link whose written path does not lead to its target and leaves how you write your links to you. [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns both the style and the path, over a wider surface — one file, one folder or the whole vault, plus converting as you type. Run it first if your links need reshaping, then come back here for everything else.

## The individual commands

- **Collect All Attachments**
  - moves every attachment into its note's folder.
- **Delete Empty Folders**
  - removes folders left empty afterwards.
- **Fix Incompatible Paths**
  - repairs the names a platform you sync to would reject, walked through in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).

**Collect All Attachments** also has a **current note** variant that acts only on the active note.

## Try it

The order matters more than any single command here, so each step is a button. Read the report between them:

```code-button
---
caption: 1. Check Vault Consistency (read-only)
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

```code-button
---
caption: 2. Reorganize Vault (does the whole sequence)
---
require('/demoSetup.ts').runCommand(app, 'reorganize-vault');
```

```code-button
---
caption: 3. Check Vault Consistency again
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

Manual equivalent: run those commands from the Command Palette in that order.

Or step through the individual commands instead of `Reorganize Vault`:

```code-button
---
caption: Collect all attachments
---
require('/demoSetup.ts').runCommand(app, 'collect-attachments-entire-vault');
```

```code-button
---
caption: Delete empty folders
---
require('/demoSetup.ts').runCommand(app, 'delete-empty-folders');
```

Manual equivalent: the Command Palette entries of the same names.

> [!NOTE]
>
> These change files across the vault and there is no undo button here - this demo vault is safe to experiment in, which is exactly why the walkthrough lives in one.

## What to notice

- **Collect All Attachments** honours the **Exclude paths from attachment collecting** setting (`excludePathsFromAttachmentCollecting`) and skips duplicates according to the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`).
- **Move Attachment to Proper Folder** moves a single attachment to the folder of the note that uses it, resolving shared attachments per `moveAttachmentToProperFolderUsedByMultipleNotesMode`.
- Which parts of the vault are eligible is bounded by the include/exclude path settings covered in [05 Settings](<./05 Settings.md>).

## Attachment-like Markdown files (such as Excalidraw) travel as attachments

Some plugins store data in files that are Markdown on disk but are really attachments. Excalidraw, for example, saves each drawing as a `.excalidraw.md` file. It is not a note you would ever read on its own - it belongs to whatever note embeds it, and it should follow that note the way a `.png` does.

So any file whose extension is listed in `treatAsAttachmentExtensions` (default `.excalidraw.md`, see [05 Settings](<./05 Settings.md>)) counts as an **attachment** rather than a note when attachments are collected: a note that references a drawing carries it into the note's own folder instead of leaving it behind as a sibling note.

### Try it

1. Open [Source note](<./Materials/04 Reorganize and convert links/Source note.md>) - it references both [Shared target](<./Materials/04 Reorganize and convert links/Shared target.md>), an ordinary note, and [Diagram.excalidraw](<./Materials/04 Reorganize and convert links/Diagram.excalidraw.md>), which is Markdown on disk but an attachment as far as this setting is concerned.
2. Run **Collect All Attachments** (or **Reorganize Vault**).
3. The drawing has moved into the folder the note's attachments belong in. **Shared target**, an ordinary note, has not moved at all.
4. Empty `treatAsAttachmentExtensions` in [05 Settings](<./05 Settings.md>) and run it again on a fresh copy - the drawing now reads as a note and stays put, which is the difference the setting makes.

## The file and folder context menu commands

Right-click a note, an attachment, or a folder in the File Explorer and the plugin adds **Collect attachments in file** (and, for an attachment, **Move attachment to proper folder**) to the context menu - the same commands available in the command palette.

### Try it

1. Right-click any note in the File Explorer - the **Collect attachments in file** command appears under the plugin's section.
2. Open **Settings -> Community plugins -> Consistent Attachments and Links** and turn **Add commands to file menu** (`shouldAddCommandsToFileMenu`) off.
3. Right-click the same note again - the plugin's commands are gone from the context menu (useful when another plugin, such as **Custom Attachment Location**, already offers them), while they stay available in the command palette. Turn the setting back on to restore them.
