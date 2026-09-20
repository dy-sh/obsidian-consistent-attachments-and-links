# Commands

Every command this plugin adds, and what it does to your vault. The bulk ones rewrite many files at once, so read the warning in [00 Start](<./00 Start.md>) before running any of them on a real vault.

Looking for `Replace All Wiki Links with Markdown Links` or `Convert All Link Paths to Relative`, or one of their three siblings each? They are gone - [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns both link style and link paths now, and does it over a wider surface. This plugin reports a link whose written path does not lead to its target; it no longer offers to rewrite one. See [04 Reorganize and convert links](<./04 Reorganize and convert links.md>).

Looking for `Delete Empty Folders`? It moved to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which you already have installed because this plugin requires it. The command kept its name and its id, so a hotkey you set for it still works - only the plugin offering it changed. An empty folder is not a link problem, and that plugin has cleaned them up automatically since this one's 4.0.0 anyway, through its **Empty folder behavior** setting; the manual vault-wide sweep now sits beside it.

## Check Vault Consistency

Reports what is inconsistent without changing anything — the one command that is always safe to run first. The report lists:

- bad links
- bad embed paths
- bad frontmatter links
- paths and names that are invalid on a platform you sync to

Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>), and for the last one in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).

## Reorganize Vault

The fastest way to clean up a vault: runs the others in the order that works, one after another.

1. `Collect All Attachments`
2. `Fix Incompatible Paths`

The order matters: renaming comes last, because the step before it resolves links against the names the files still had.

To also give attachments content-based names, run [`Unique attachments`](https://community.obsidian.md/plugins/unique-attachments) afterwards — optional, and a separate plugin.

## Collect All Attachments

Moves every attachment into the folder its note's settings say it belongs in, per [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>). Use it when you are not sure every attachment is where it should be.

An attachment referenced by more than one note is not simply moved — see [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>) for what happens instead.

## Fix Incompatible Paths

Renames every file and folder whose path or name is invalid on a platform you have ticked in the settings - too long, containing a character that platform forbids, or named after an MS-DOS device. Links follow the rename, and the original name is kept in the note's `aliases` and `title`.

Walked through in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).
