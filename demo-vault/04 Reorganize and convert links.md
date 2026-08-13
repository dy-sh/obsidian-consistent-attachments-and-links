# Reorganize and convert links

The plugin's headline bulk feature turns an inconsistent vault into a portable one where every link is a relative Markdown link and every attachment sits next to the note that uses it. You can run the steps individually or all at once.

> [!WARNING]
>
> These commands change files across the vault. Back up a real vault first. This demo vault is safe to experiment in.

## The individual commands

- **Replace All Wiki Links with Markdown Links** - `[[readme]]` becomes `[readme](readme.md)`.
- **Replace All Wiki Embeds with Markdown Embeds** - `![[readme]]` becomes `![readme](readme.md)`.
- **Convert All Embed Paths to Relative** - rewrites embed paths to be relative to the note.
- **Convert All Link Paths to Relative** - the same, for links.
- **Collect All Attachments** - moves every attachment into its note's folder.
- **Delete Empty Folders** - removes folders left empty afterwards.

Each of these also has a **current note** variant that acts only on the active note.

## Try it

1. Run **Check Vault Consistency** first (see [03 Check vault consistency](<./03 Check vault consistency.md>)) to see what will change.
2. Run **Reorganize Vault** to perform the whole sequence in one go, or run the individual commands above in order.
3. Re-run **Check Vault Consistency** - the report should now be clean.

## What to notice

- **Collect All Attachments** honours the **Exclude paths from attachment collecting** setting (`excludePathsFromAttachmentCollecting`) and skips duplicates according to the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`).
- **Move Attachment to Proper Folder** moves a single attachment to the folder of the note that uses it, resolving shared attachments per `moveAttachmentToProperFolderUsedByMultipleNotesMode`.
- Which parts of the vault are eligible is bounded by the include/exclude path settings covered in [05 Settings](<./05 Settings.md>).

## Attachment-like Markdown files (such as Excalidraw) are left untouched

Some plugins store data in files that are Markdown on disk but are really attachments. Excalidraw, for example, saves each drawing as a `.excalidraw.md` file and references its embedded images with wikilinks. Rewriting those wikilinks into Markdown links would stop the drawing from rendering, so the link-rewriting commands skip any file whose extension is listed in `treatAsAttachmentExtensions` (default `.excalidraw.md`, see [05 Settings](<./05 Settings.md>)).

### Try it

1. Open [Diagram.excalidraw](<./Examples/Diagram.excalidraw.md>) - it references [Shared target](<./Examples/Shared target.md>) with a wikilink, exactly as Excalidraw stores its embeds.
2. Run **Replace All Wiki Links with Markdown Links** (or **Reorganize Vault**).
3. Open [Source note](<./Examples/Source note.md>) - its `[[Shared target]]` wikilink became a Markdown link.
4. Re-open [Diagram.excalidraw](<./Examples/Diagram.excalidraw.md>) - its wikilink is **unchanged**, because the file is treated as an attachment.

## The file and folder context menu commands

Right-click a note, an attachment, or a folder in the File Explorer and the plugin adds **Collect attachments in file** (and, for an attachment, **Move attachment to proper folder**) to the context menu - the same commands available in the command palette.

### Try it

1. Right-click any note in the File Explorer - the **Collect attachments in file** command appears under the plugin's section.
2. Open **Settings -> Community plugins -> Consistent Attachments and Links** and turn **Add commands to file menu** (`shouldAddCommandsToFileMenu`) off.
3. Right-click the same note again - the plugin's commands are gone from the context menu (useful when another plugin, such as **Custom Attachment Location**, already offers them), while they stay available in the command palette. Turn the setting back on to restore them.
