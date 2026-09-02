# Collect attachments into the note's folder

Obsidian's default is one shared attachments folder for the whole vault, so every note's images pile up in the same place and nothing tells you which picture belongs to which note. **Collect attachments** undoes that: it moves the attachments a note actually references into that note's own folder, and rewrites the links so they keep resolving.

It does it safely. An attachment that another note also references is not simply taken away — what happens instead is yours to choose, through the **Attachment used by multiple notes** mode (`collectAttachmentUsedByMultipleNotesMode`), which can skip it, copy it, move it anyway, or ask.

Where the attachment lands is Obsidian's decision, not this plugin's: it goes to whatever **Default location for new attachments** is set to. See [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>).

## Try it

**Step 1 — make a note whose attachment lives somewhere else.** Doing this by hand needs an image to hand, and lands the attachment wherever your own settings put it — so the button creates both, with the attachment deliberately parked in a shared folder:

```code-button
---
caption: Create Trip.md with its attachment in a shared folder
---
await require('/demoSetup.ts').createTripNote(app);
```

Manual equivalent: create `Trip.md` and embed an image that lives in some other folder.

**Step 2 — collect.**

```code-button
---
caption: Collect attachments in current note
---
require('/demoSetup.ts').runCommand(app, 'collect-attachments-in-file');
```

Manual equivalent: run **Collect attachments in current note** from the Command Palette, or right-click the note in the File Explorer and choose **Collect attachments in file**.

**Step 3.** The image has moved out of the shared folder and into the note's own, and the embed inside the note points at where it went. Open the moved note and check the embed still renders.

Start over, or put the vault back:

```code-button
---
caption: Reset the Trip demo
---
await require('/demoSetup.ts').resetTripDemo(app);
```

## Do it without running a command

Collecting can also happen as you type, so a pasted image never has time to end up in the wrong folder:

```code-button
---
caption: Enable Auto Collect Attachments
---
await require('/demoSetup.ts').changeSettings(app, { shouldCollectAttachmentsAutomatically: true });
```

```code-button
---
caption: Restore the default (collect only on command)
---
await require('/demoSetup.ts').changeSettings(app, { shouldCollectAttachmentsAutomatically: false });
```

It is off by default because it changes files on disk while you are editing them.

## What to notice

- The attachment ends up next to the note, not in a shared folder shared with everything else.
- If the same image were embedded in another note too, the plugin would not silently steal it — see `collectAttachmentUsedByMultipleNotesMode` in [05 Settings](<./05 Settings.md>).
- A folder that is really one attachment — a saved web page beside its `_files` folder, a drawing beside the images it references — travels whole, if you list it under **Attachment unit folders** (`attachmentUnitFolderPaths`).

## Renaming and deleting notes

Moving a note so its attachments follow, and deleting a note so its now-unused attachments go too, are **not** this plugin's job any more. Since 4.0.0 they belong to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which owns them for the whole vault — several plugins used to each run their own copy, and two of them acting on one rename is how links get corrupted. Install it and its own demo vault walks through renaming, deleting and shared attachments.

Next: audit the whole vault at once in [03 Check vault consistency](<./03 Check vault consistency.md>).
