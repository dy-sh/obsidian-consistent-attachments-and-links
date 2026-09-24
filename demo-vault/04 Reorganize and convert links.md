# Reorganize and convert links

The plugin's bulk repair tidies a vault in one pass: every name repaired that a platform you sync to would reject.

> [!WARNING]
>
> This command renames files across the vault. Back up a real vault first. This demo vault is safe to experiment in.

<!-- Separates the two callouts; without it markdownlint reads them as one blockquote. -->

> [!NOTE] Rewriting links and moving attachments are other plugins' jobs
>
> This plugin used to have `Replace All Wiki Links with Markdown Links` and `Convert All Link Paths to Relative`, and three siblings each, because it was built to force a vault's migration to relative Markdown links. It no longer does that: it **reports** a link whose written path does not lead to its target and leaves how you write your links to you. [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns both the style and the path, over a wider surface — one file, one folder or the whole vault, plus converting as you type.
>
> It used to collect attachments too, and **Reorganize Vault** started by doing so. Since 5.0.0 that belongs to [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) — see [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>). Run those plugins first if your links or attachments need moving, then come back here for everything else.

## What Reorganize Vault runs

- **Fix Incompatible Paths**
  - repairs the names a platform you sync to would reject, walked through in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).

## Try it

Read the report before and after, so you can see exactly what changed:

```code-button
---
caption: 1. Check Vault Consistency (read-only)
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

```code-button
---
caption: 2. Reorganize Vault
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

> [!NOTE]
>
> This changes files across the vault and there is no undo button here - this demo vault is safe to experiment in, which is exactly why the walkthrough lives in one.

## What to notice

- Which parts of the vault are eligible is bounded by the include/exclude path settings covered in [05 Settings](<./05 Settings.md>).

## Attachment-like Markdown files (such as Excalidraw) count as attachments

Some plugins store data in files that are Markdown on disk but are really attachments. Excalidraw, for example, saves each drawing as a `.excalidraw.md` file. It is not a note you would ever read on its own - it belongs to whatever note embeds it, exactly as a `.png` does.

So any file whose extension is listed in `treatAsAttachmentExtensions` (default `.excalidraw.md`, see [05 Settings](<./05 Settings.md>)) counts as an **attachment** rather than a note in the report's **Misplaced attachments** section: a drawing sitting outside the attachment folder of the note that references it is named there, just as a misplaced image would be. An ordinary note in the same place is not, because a note is not an attachment.

The plugin never rewrites what is written inside such a file. A drawing keeps its references in its own private format, and rewriting them would stop it rendering.

### Try it

1. Open [Source note](<./Materials/04 Reorganize and convert links/Source note.md>) - it references both [Shared target](<./Materials/04 Reorganize and convert links/Shared target.md>), an ordinary note, and [Diagram.excalidraw](<./Materials/04 Reorganize and convert links/Diagram.excalidraw.md>), which is Markdown on disk but an attachment as far as this setting is concerned.
2. Run **Check Vault Consistency**.
3. This vault keeps attachments in `_assets/attachments`, so the drawing is listed under **Misplaced attachments**, with that folder named as where it belongs. **Shared target**, an ordinary note in the same place, is not.
4. Empty `treatAsAttachmentExtensions` in [05 Settings](<./05 Settings.md>) and check again - the drawing now reads as a note and is no longer judged, which is the difference the setting makes.
