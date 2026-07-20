[Docs](https://github.com/mnaoumov/obsidian-codescript-toolkit/)

# CodeScript Toolkit prerequisite

The **Run** buttons in this vault are powered by [`CodeScript Toolkit`](https://github.com/mnaoumov/obsidian-codescript-toolkit/). This vault installs and enables it for you automatically the first time you open the vault (and trust it). Nothing here is required to explore Consistent Attachments and Links - the feature is driven by ordinary file operations and the plugin's own commands.

## If the buttons do not work

If a code block does not turn into a button, install CodeScript Toolkit manually:

1. Open **Settings -> Community plugins -> Browse**.
2. Search for **CodeScript Toolkit**, install it, and enable it.
3. Reopen a note that has a **Run** button.

Or click the button below to install and enable it (needs an internet connection):

```code-button
---
caption: Install CodeScript Toolkit
---
await require('/demoSetup.ts').installAndEnable(app, 'fix-require-modules');
```
