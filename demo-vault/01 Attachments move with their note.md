[Docs](https://github.com/mnaoumov/obsidian-consistent-attachments-and-links/)

# Attachments move with their note

When an attachment lives in the same folder as the note that uses it (or a subfolder), this plugin moves the attachment along with the note whenever you move the note. It does this safely: an attachment that is also referenced by other notes is copied rather than stolen away, so no other note is left with a broken embed.

This vault sets Obsidian's **Default location for new attachments** to `_assets/attachments` (see [[05 Settings]]), and the plugin's own **Move Attachments with Note** behavior (`shouldMoveAttachmentsWithNote`) governs the move.

## Try it

1. Open **Settings -> Community plugins -> Consistent Attachments and Links** and enable **Move Attachments with Note** (this is off by default because it changes files on disk).
2. Create a new note anywhere in the vault, for example `Trip.md`.
3. Paste or drag an image into it so an attachment is created and embedded.
4. Create a folder, for example `Archive`, and move `Trip.md` into it (drag it in the File Explorer, or use **Move file to another folder**).
5. The plugin moves the image alongside the note and rewrites the embed so it still resolves.

## What to notice

- The attachment ends up next to the note, not orphaned in the old attachments folder.
- If the same image were embedded in another note too, the plugin would copy it instead of moving it, controlled by the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`).
- Deleting the note can also delete its now-unused attachments when **Delete Attachments with Note** (`shouldDeleteAttachmentsWithNote`) is enabled.

Next: see how links survive the same operations in [[02 Links stay valid on rename and move]].
