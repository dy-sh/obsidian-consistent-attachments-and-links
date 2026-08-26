# Recommended Obsidian settings

This plugin's goal is a vault whose links keep working **outside** Obsidian — opened in another editor, published to GitHub, or exported as a folder. Obsidian's own defaults pull the other way: they lean on a clever link resolver that only Obsidian has. None of the settings below is mandatory, but each one moves your vault towards being readable by anything.

## Use Markdown links instead of wikilinks

`[[Wikilinks]]` are an Obsidian convention. `[Markdown Links](Markdown%20Links.md)` are what every other markdown tool understands, so a note that uses them survives leaving the vault.

![Wikilinks](<./_assets/images/wikilinks.png>)

If you want Markdown links but find the `%20` escapes unreadable, the [`Better Markdown Links`](https://obsidian.md/plugins?id=better-markdown-links) plugin cleans them up.

## Set `New link format` to `Relative path to file`

A relative path resolves from the note itself, so a folder you copy elsewhere keeps working. An absolute or shortest-path link only means something to a resolver that knows where the vault root is.

![New link format](<./_assets/images/new-link-format.png>)

## Where new attachments go

Since [v3.0.0](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases/tag/3.0.0) this plugin does **not** manage an attachment-subfolder setting of its own. It follows Obsidian's built-in [`Default location for new attachments`](https://help.obsidian.md/Editing+and+formatting/Attachments#Change+default+attachment+location).

Ideally an attachment lives in the note's own folder or a subfolder of it. Then exporting a note means copying one folder, and deleting a note cannot strand files or take someone else's with it — which is the property `Collect All Attachments` exists to establish, see [07 Commands](<./07 Commands.md>).

For finer control than Obsidian's single setting offers — a folder per note, names built from tokens — install [Custom Attachment Location](https://obsidian.md/plugins?id=obsidian-custom-attachment-location).

## Speed

Several of this plugin's operations walk every backlink in the vault. Installing [`Backlink Cache`](https://obsidian.md/plugins?id=backlink-cache) makes those operations noticeably faster on a large vault.
