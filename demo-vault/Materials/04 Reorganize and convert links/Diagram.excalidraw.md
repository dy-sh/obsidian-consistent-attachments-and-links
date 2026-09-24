---
excalidraw-plugin: parsed
---
# Diagram.excalidraw

<!-- obsidian-dev-utils-disable-next-line demo-vault-validation/no-wikilinks -- This file stands in for an Excalidraw drawing, which stores its references as wikilinks. -->
This file stands in for an Excalidraw drawing. The Excalidraw plugin saves each drawing as a `.excalidraw.md` file and stores its references as **wikilinks** - here a link to [[Shared target]], mirroring how Excalidraw references an embedded image such as `![[drawing.png]]`.

A drawing is not a note you would read on its own: it belongs to whatever note embeds it. Because `.excalidraw.md` is listed in `treatAsAttachmentExtensions` (see [05 Settings](<../../05 Settings.md>)), this file counts as an **attachment** rather than a note, so the consistency report's **Misplaced attachments** section judges where it sits against the folder the referencing note's attachments belong in - exactly as it would a `.png`.

The plugin never rewrites what is written inside it, so the wikilink above is left exactly as written. A real drawing stores its embedded images the same way, and rewriting those references would stop it rendering.
