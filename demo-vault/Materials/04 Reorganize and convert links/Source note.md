# Source note

This note exists to demonstrate what the consistency report treats as an attachment. It references two files that both sit right beside it: [Shared target](<./Shared target.md>), an ordinary note, and [Diagram.excalidraw](<./Diagram.excalidraw.md>), which is Markdown on disk but is really a drawing.

Follow the steps in [04 Reorganize and convert links](<../../04 Reorganize and convert links.md>): run **Check Vault Consistency** and watch the drawing appear under **Misplaced attachments** - because `.excalidraw.md` is listed in `treatAsAttachmentExtensions` - while **Shared target**, a note like any other, does not.
