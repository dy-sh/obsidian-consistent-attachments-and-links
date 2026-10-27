# Where the old features went

`Consistent Attachments and Links` has been cut down over time to reporting and path repair. Each feature it used to have now has a single owner, so two plugins no longer carry copies of the same feature. The [changelog](../CHANGELOG.md) says which release moved each one.

| What you used | Where it lives now | What to do |
| --- | --- | --- |
| Rewriting links and moving attachments on rename, move and delete (until 4.0.0) | [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) | Nothing to install: this plugin requires it. Turn on its rename and delete handling; this plugin offers your old settings to it. |
| `Delete empty folders`, automatic and manual | [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) | The automatic half is its **Empty folder behavior** setting. The manual command kept its name and id there, so an existing hotkey keeps working. |
| The four `Replace all wiki…` commands | [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) | It converts one file, one folder or the whole vault, and can convert as you type. The report no longer treats a wikilink as a defect. |
| The four `Convert all … paths to relative` commands | [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) | It owns link paths as well as link style. The report still lists a path that does not resolve. |
| **Collect attachments**, **Move attachment to proper folder** and collecting as you edit (until 5.0.0) | [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) | Optional: this plugin suggests it, and the first time both are installed it offers your old collect settings, showing what would change and writing nothing unless you approve. This plugin still reports a misplaced attachment. |
| `Reorganize vault` | Retired | Every step but the last moved to the plugins above, so run **Fix incompatible paths** — it does exactly what `Reorganize vault` still did. |
| The `Attachment Subfolder` setting (until [3.0.0](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases/tag/3.0.0)) | [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) | It chooses the folder each new attachment goes into, per note or per anything a pattern can express, and it is what this plugin's report checks attachments against. Without it, this plugin follows Obsidian's built-in [`Default location for new attachments`](https://help.obsidian.md/Editing+and+formatting/Attachments#Change+default+attachment+location). See [06 Recommended Obsidian settings](<../demo-vault/06 Recommended Obsidian settings.md>). |

Every command, and the full story of each one that left, is in [07 Commands](<../demo-vault/07 Commands.md>).
