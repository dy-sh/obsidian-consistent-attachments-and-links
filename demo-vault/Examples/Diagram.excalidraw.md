---
excalidraw-plugin: parsed
---

This file stands in for an Excalidraw drawing. The Excalidraw plugin saves each drawing as a `.excalidraw.md` file and stores its references as **wikilinks** - here a link to [[Shared target]], mirroring how Excalidraw references an embedded image such as `![[drawing.png]]`.

The link-rewriting commands in [[04 Reorganize and convert links]] would normally turn `[[Shared target]]` into a Markdown link. Because `.excalidraw.md` is listed in `treatAsAttachmentExtensions` (see [[05 Settings]]), this file is skipped during link rewriting, so its wikilinks stay intact and Excalidraw keeps resolving its embeds.
