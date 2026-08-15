# Check vault consistency

Before reorganizing anything, you can audit the whole vault without changing a single file. The **Check Vault Consistency** command scans every note and writes a report listing what is not yet in the plugin's consistent form:

- Bad (broken) links
- Bad (broken) embed paths
- Wiki-links that are still `[[wikilink]]` style
- Wiki-embeds that are still `![[wikilink]]` style

## Try it

```code-button
---
caption: Check Vault Consistency
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

Manual equivalent: run **Check Vault Consistency** from the Command Palette (`Ctrl/Cmd-P`).

1. The plugin generates a report note and opens it. Its path is configurable via the **Consistency report file** setting (`consistencyReportFile`, default `consistency-report.md`).
2. Read the report to see which notes still contain wiki-links, wiki-embeds, or broken paths.

## What to notice

- Nothing is modified by this command - it is a safe, read-only audit you can run any time.
- The report is the natural starting point before you run the conversion and reorganization commands in [04 Reorganize and convert links](<./04 Reorganize and convert links.md>).
