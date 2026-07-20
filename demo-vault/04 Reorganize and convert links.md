[Docs](https://github.com/mnaoumov/obsidian-consistent-attachments-and-links/)

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

1. Run **Check Vault Consistency** first (see [[03 Check vault consistency]]) to see what will change.
2. Run **Reorganize Vault** to perform the whole sequence in one go, or run the individual commands above in order.
3. Re-run **Check Vault Consistency** - the report should now be clean.

## What to notice

- **Collect All Attachments** honours the **Exclude paths from attachment collecting** setting (`excludePathsFromAttachmentCollecting`) and skips duplicates according to the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`).
- **Move Attachment to Proper Folder** moves a single attachment to the folder of the note that uses it, resolving shared attachments per `moveAttachmentToProperFolderUsedByMultipleNotesMode`.
- Which parts of the vault are eligible is bounded by the include/exclude path settings covered in [[05 Settings]].
