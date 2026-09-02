---
excalidraw-plugin: parsed
---
# Diagram.excalidraw

<!-- obsidian-dev-utils-disable-next-line demo-vault-validation/no-wikilinks -- This file stands in for an Excalidraw drawing, whose wikilink the rewriting commands must leave alone. -->
This file stands in for an Excalidraw drawing. The Excalidraw plugin saves each drawing as a `.excalidraw.md` file and stores its references as **wikilinks** - here a link to [[Shared target]], mirroring how Excalidraw references an embedded image such as `![[drawing.png]]`.

The link-rewriting commands in [04 Reorganize and convert links](<../../04 Reorganize and convert links.md>) would normally rewrite the path inside `[[Shared target]]`. Because `.excalidraw.md` is listed in `treatAsAttachmentExtensions` (see [05 Settings](<../../05 Settings.md>)), this file is skipped during link rewriting, so its wikilinks stay intact and Excalidraw keeps resolving its embeds.
