# Start here

Welcome to the [Consistent Attachments and Links](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/) demo vault. This plugin audits a vault for what breaks outside Obsidian: it reports every link whose written path does not itself lead to its target, every attachment sitting outside its note's attachment folder, and every name a platform you sync to would reject - and it repairs those names.

> [!IMPORTANT] Renaming and deleting moved out
>
> Since 4.0.0 this plugin no longer handles renames and deletions. [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) owns those for the whole vault — this plugin requires it and loads nothing without it, so this vault installs it for you on first open. Turn on its rename and delete handling to keep attachments traveling with their note and links rewritten when you move, rename or delete one.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT] Collecting attachments moved out
>
> Since 5.0.0 this plugin no longer collects attachments. [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) owns **Collect attachments**, **Move attachment to proper folder** and collecting as you edit - see [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>). This plugin still reports a misplaced attachment.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!WARNING] Back up real vaults first
>
> Because the plugin can rename files across your vault, always back up a real vault before running its bulk commands. This throwaway demo vault is safe to experiment in.

## Your first two minutes

1. Open [Source note](<./Materials/03 Check vault consistency/Source note.md>). It references **Shared target**, an ordinary note, and **Diagram.excalidraw**, which is Markdown on disk but is really a drawing — and the plugin treats those two very differently.
2. Press the **Check Vault Consistency** button below. It changes nothing; it just writes a report of what a reader outside Obsidian would trip over.
3. Read that report - the drawing is listed under **Misplaced attachments** and the ordinary note is not - then see why in [03 Check vault consistency](<./03 Check vault consistency.md>).

Then work down the list below. The bulk commands all have buttons - most usefully the read-only **Check Vault Consistency**, which is worth pressing before and after anything else so you can see exactly what changed:

```code-button
---
caption: Check Vault Consistency (read-only)
---
await require('/demoSetup.ts').checkConsistency(app);
```

Manual equivalent: run **Check Vault Consistency** from the Command Palette.

## Features

- [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>)
- [03 Check vault consistency](<./03 Check vault consistency.md>)
- [05 Settings](<./05 Settings.md>)
- [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>)
- [07 Commands](<./07 Commands.md>)
- [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>)

The numbering has two gaps. **02 Links stay valid on rename and move** went to Advanced Rename and Delete Handler with the rest of the rename handling. **04 Reorganize and convert links** went when its subject did: link conversion left for Better Markdown Links, and the `Reorganize vault` command it walked through was retired once all it still ran was **Fix Incompatible Paths** - its one surviving section, about Excalidraw drawings, now lives in [03 Check vault consistency](<./03 Check vault consistency.md>). The remaining notes keep their numbers so links already pointing at them still resolve.

## Materials

`Materials/` holds the notes and attachments the walkthroughs operate on, one folder per note that needs them — `Materials/03 Check vault consistency/` belongs to [03 Check vault consistency](<./03 Check vault consistency.md>). You never have to open it directly; each note links to what it needs. The repair walkthrough renames files, so expect the contents to change as you follow it — that is the point.
