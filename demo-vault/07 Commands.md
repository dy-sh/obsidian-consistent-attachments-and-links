# Commands

Every command this plugin adds, and what it does to your vault. The bulk ones rewrite many files at once, so read the warning in [00 Start](<./00 Start.md>) before running any of them on a real vault.

## Check Vault Consistency

Reports what is inconsistent without changing anything — the one command that is always safe to run first. The report lists:

- bad links
- bad embed paths
- wiki-links
- wiki-embeds

Walked through in [03 Check vault consistency](<./03 Check vault consistency.md>).

## Reorganize Vault

The fastest way to clean up a vault: runs the others in the order that works, one after another.

1. `Replace All Wiki Links with Markdown Links`
2. `Replace All Wiki Embeds with Markdown Embeds`
3. `Convert All Embed Paths to Relative`
4. `Convert All Link Paths to Relative`
5. `Collect All Attachments`
6. `Delete Empty Folders`

The order matters: links are converted to Markdown before their paths are made relative, and attachments are collected before empty folders are swept, so nothing is deleted while something still points into it.

To also give attachments content-based names, run [`Unique attachments`](https://community.obsidian.md/plugins/unique-attachments) afterwards — optional, and a separate plugin.

## Replace All Wiki Links with Markdown Links

Converts every wikilink into a Markdown link.

- `[[readme]]` becomes `[readme](readme.md)`

## Replace All Wiki Embeds with Markdown Embeds

The same for embeds.

- `![[readme]]` becomes `![readme](readme.md)`

## Convert All Embed Paths to Relative

Rewrites every embed's path so it resolves from the note rather than from the vault root.

- `![](title.png)` becomes `![](../attachments/title.png)`

This is the step that does most of the work towards consistency: afterwards every embed points at a real file by a path that survives leaving the vault.

## Convert All Link Paths to Relative

The same for links.

- `[](readme.md)` becomes `[](../readme.md)`

## Collect All Attachments

Moves every attachment into the folder its note's settings say it belongs in, per [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>). Use it when you are not sure every attachment is where it should be.

An attachment referenced by more than one note is not simply moved — see [01 Attachments move with their note](<./01 Attachments move with their note.md>) for what happens instead.

## Delete Empty Folders

Removes every empty folder in the vault, which is usually the debris left by the commands above.
