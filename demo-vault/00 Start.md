# Start here

Welcome to the [Consistent Attachments and Links](https://github.com/mnaoumov/obsidian-consistent-attachments-and-links/) demo vault. This plugin makes a vault consistent in the plainest sense: every link a real relative path in standard Markdown, every attachment in its own note's folder. It collects scattered attachments into place, converts an existing vault to that shape, and audits the whole vault for what is still broken.

> [!IMPORTANT] Renaming and deleting moved out
>
> Since 4.0.0 this plugin no longer handles renames and deletions. [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) owns those for the whole vault — install it to keep attachments traveling with their note and links rewritten when you move, rename or delete one. Everything in this vault keeps working without it.

<!-- Separates the two callouts; without it markdownlint reads them as one blockquote. -->

> [!WARNING] Back up real vaults first
>
> Because the plugin can move and delete files across your vault, always back up a real vault before running its bulk commands. This throwaway demo vault is safe to experiment in.

## Your first two minutes

1. Open [Source note](<./Materials/04 Reorganize and convert links/Source note.md>). It links to **Shared target**, a note sitting beside it — and the link is a wikilink, which only Obsidian can resolve.
2. Press the **Check Vault Consistency** button below. It changes nothing; it just writes a report of what a reader outside Obsidian would trip over.
3. Read that report, then go and fix it in one command with [04 Reorganize and convert links](<./04 Reorganize and convert links.md>).

Then work down the list below. The bulk commands all have buttons - most usefully the read-only **Check Vault Consistency**, which is worth pressing before and after anything else so you can see exactly what changed:

```code-button
---
caption: Check Vault Consistency (read-only)
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

Manual equivalent: run **Check Vault Consistency** from the Command Palette.

## Features

- [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>)
- [03 Check vault consistency](<./03 Check vault consistency.md>)
- [04 Reorganize and convert links](<./04 Reorganize and convert links.md>)
- [05 Settings](<./05 Settings.md>)
- [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>)
- [07 Commands](<./07 Commands.md>)
- [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>)

The numbering has a gap where **02 Links stay valid on rename and move** used to be. Its subject went to Advanced Rename and Delete Handler with the rest of the rename handling; the remaining notes keep their numbers so links already pointing at them still resolve.

## Materials

`Materials/` holds the notes and attachments the walkthroughs operate on, one folder per note that needs them — `Materials/04 Reorganize and convert links/` belongs to [04 Reorganize and convert links](<./04 Reorganize and convert links.md>). You never have to open it directly; each note links to what it needs. Since this plugin's whole subject is moving links and attachments around, expect the contents to change as you follow the walkthroughs — that is the point.
