# Collect attachments into the note's folder

Since 5.0.0 this plugin no longer collects attachments. [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) does, and it offers more of it: **Collect attachments** for one note, one folder or the whole vault, **Move attachment to proper folder**, collecting automatically as you edit, and attachment folders built from a template. Its own demo vault walks through all of it.

Why the change: two plugins each carried a copy of the same collector, kept deliberately identical, and a user who had both installed got two sets of collect commands in the file menu. One owner is the fix. This note keeps its name so links already pointing at it still resolve.

## What this plugin still does about attachments

It **reports** where they are. The **Misplaced attachments** section of the consistency report names every attachment that sits outside the attachment folder configured for the note that references it, and changes nothing. Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>).

```code-button
---
caption: Check Vault Consistency (read-only)
---
await require('/demoSetup.ts').checkConsistency(app);
```

Manual equivalent: run **Check Vault Consistency** from the Command Palette.

Acting on a finding is Custom Attachment Location's **Move attachment to proper folder**, or its **Collect attachments**.

## Your collect settings are not lost

If you used collecting in 4.x, this plugin offers your settings to Custom Attachment Location once, the first time both are installed: what to do with an attachment several notes share, the paths collecting leaves alone, the attachment unit folders, and whether collecting ran as you edited. That plugin shows you exactly what would change and writes nothing unless you approve. Cancelling leaves the offer pending, so it comes back. See [05 Settings](<./05 Settings.md>) for the key that tracks it.

## Renaming and deleting notes

Moving a note so its attachments follow, and deleting a note so its now-unused attachments go too, left even earlier: since 4.0.0 they belong to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which owns them for the whole vault. Install it and its own demo vault walks through renaming, deleting and shared attachments.

Next: audit the whole vault at once in [03 Check vault consistency](<./03 Check vault consistency.md>).
