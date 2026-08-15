# Attachments move with their note

When an attachment lives in the same folder as the note that uses it (or a subfolder), this plugin moves the attachment along with the note whenever you move the note. It does this safely: an attachment that is also referenced by other notes is copied rather than stolen away, so no other note is left with a broken embed.

This vault sets Obsidian's **Default location for new attachments** to `_assets/attachments` (see [05 Settings](<./05 Settings.md>)), and the plugin's own **Move Attachments with Note** behavior (`shouldMoveAttachmentsWithNote`) governs the move.

## Try it

1. Turn the behavior on - it is off by default because it changes files on disk:

   ```code-button
   ---
   caption: Enable Move Attachments with Note
   ---
   await require('/demoSetup.ts').changeSettings(app, { shouldMoveAttachmentsWithNote: true });
   ```

   Manual equivalent: enable **Move Attachments with Note** in **Settings -> Community plugins -> Consistent Attachments and Links**.

2. Make a note that owns an attachment. Doing this by hand needs an image to hand, and lands the attachment wherever your own settings put it - so the button creates both, with the attachment already beside the note:

   ```code-button
   ---
   caption: Create Trip.md with its own attachment
   ---
   await require('/demoSetup.ts').createTripNote(app);
   ```

   Manual equivalent: create `Trip.md` and paste or drag an image into it.

3. Move the note:

   ```code-button
   ---
   caption: Move Trip.md into an Archive folder
   ---
   await require('/demoSetup.ts').moveTripNoteToArchive(app);
   ```

   Manual equivalent: create an `Archive` folder and drag `Trip.md` into it.

4. The plugin moves the image alongside the note and rewrites the embed so it still resolves. Open the moved note and check the embed still renders.

Start over, or put the vault back:

```code-button
---
caption: Reset the Trip demo
---
await require('/demoSetup.ts').resetTripDemo(app);
```

```code-button
---
caption: Restore the default (do not move attachments)
---
await require('/demoSetup.ts').changeSettings(app, { shouldMoveAttachmentsWithNote: false });
```

## What to notice

- The attachment ends up next to the note, not orphaned in the old attachments folder.
- If the same image were embedded in another note too, the plugin would copy it instead of moving it, controlled by the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`).
- Deleting the note can also delete its now-unused attachments when **Delete Attachments with Note** (`shouldDeleteAttachmentsWithNote`) is enabled.

Next: see how links survive the same operations in [02 Links stay valid on rename and move](<./02 Links stay valid on rename and move.md>).
