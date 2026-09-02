# Commands

Every command this plugin adds, and what it does to your vault. The bulk ones rewrite many files at once, so read the warning in [00 Start](<./00 Start.md>) before running any of them on a real vault.

Looking for `Replace All Wiki Links with Markdown Links` or one of its three siblings? They are gone - [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns wikilink conversion now, and does it over a wider surface. See [04 Reorganize and convert links](<./04 Reorganize and convert links.md>).

## Check Vault Consistency

Reports what is inconsistent without changing anything — the one command that is always safe to run first. The report lists:

- bad links
- bad embed paths
- bad frontmatter links
- paths and names that are invalid on a platform you sync to

Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>), and for the last one in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).

## Reorganize Vault

The fastest way to clean up a vault: runs the others in the order that works, one after another.

1. `Convert All Embed Paths to Relative`
2. `Convert All Link Paths to Relative`
3. `Collect All Attachments`
4. `Delete Empty Folders`
5. `Fix Incompatible Paths`

The order matters: attachments are collected before empty folders are swept, so nothing is deleted while something still points into it. Renaming comes last, because every step before it resolves links against the names the files still had.

To also give attachments content-based names, run [`Unique attachments`](https://community.obsidian.md/plugins/unique-attachments) afterwards — optional, and a separate plugin.

## Convert All Embed Paths to Relative

Rewrites every embed's path so it resolves from the note rather than from the vault root.

- `![](title.png)` becomes `![](../attachments/title.png)`

This is the step that does most of the work towards consistency: afterwards every embed points at a real file by a path that survives leaving the vault.

## Convert All Link Paths to Relative

The same for links.

- `[](readme.md)` becomes `[](../readme.md)`

## Collect All Attachments

Moves every attachment into the folder its note's settings say it belongs in, per [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>). Use it when you are not sure every attachment is where it should be.

An attachment referenced by more than one note is not simply moved — see [01 Collect attachments into the note's folder](<./01 Collect attachments into the note's folder.md>) for what happens instead.

## Delete Empty Folders

Removes every empty folder in the vault, which is usually the debris left by the commands above.

## Fix Incompatible Paths

Renames every file and folder whose path or name is invalid on a platform you have ticked in the settings - too long, containing a character that platform forbids, or named after an MS-DOS device. Links follow the rename, and the original name is kept in the note's `aliases` and `title`.

Walked through in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).
