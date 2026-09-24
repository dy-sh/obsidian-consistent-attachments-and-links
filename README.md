# Consistent Attachments and Links

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/dy-sh/obsidian-consistent-attachments-and-links)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases) [![GitHub downloads](https://img.shields.io/github/downloads/dy-sh/obsidian-consistent-attachments-and-links/total)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases) [![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links)

[Obsidian](https://obsidian.md/) resolves links with a clever search that only Obsidian has, so a vault can be perfectly navigable inside it and full of dead links the moment you open a note anywhere else — in another editor, published to GitHub, or exported as a folder.

This plugin makes that visible: it audits the whole vault and reports every link whose written path does not itself lead to its target and every attachment sitting outside its note's attachment folder, and repairs names and paths that a platform you sync to would reject — not because Obsidian cannot open them, but because that platform's filesystem cannot store them. It never rewrites a link into a style, moves an attachment or cleans up folders: where those matter, it reports and leaves the change to you.

> [!IMPORTANT]
>
> Since **4.0.0** this plugin no longer handles renames and deletions. Install [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) to keep attachments traveling with their note and links rewritten when you move, rename or delete one — it owns that for the whole vault now, so several plugins can no longer fight over it. This plugin requires it: it loads nothing until that plugin is installed, explains why, and installs it in one click — which changes nothing on its own, since its defaults do nothing until you turn renames or deletions on. It then offers to hand your old settings across.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT]
>
> This plugin no longer converts wikilinks to Markdown links. It was built to force a vault's migration to Markdown links; that is no longer its job, so the four `Replace all wiki…` commands are gone and the consistency report no longer treats a wikilink as a defect. [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns the conversion now, over a wider surface — one file, one folder or the whole vault, plus converting as you type.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT]
>
> This plugin no longer rewrites a link's path either, so the four `Convert all … paths to relative` commands are gone with it. Rewriting a link into a *style* is not what this plugin is for — it reports every link whose written path does not lead to its target, and leaves how you write your links to you. [Better Markdown Links](https://community.obsidian.md/plugins/better-markdown-links) owns link paths as well as link style. The report is unchanged: a path that does not resolve is still listed, whether or not anything offers to convert it.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT]
>
> The `Delete empty folders` command is gone too. An empty folder is not a link problem — the command read no link and the report never listed one — and this plugin's automatic half of it moved to [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) in **4.0.0** already, as its **Empty folder behavior** setting. That plugin now offers the manual vault-wide sweep as well, under the same `Delete empty folders` name and the same command id, so an existing hotkey keeps working. You already have it installed: this plugin requires it.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT]
>
> Since **5.0.0** this plugin no longer collects attachments. [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) owns that now: **Collect attachments** for a note, a folder or the whole vault, **Move attachment to proper folder**, and collecting as you edit. Two plugins used to each carry a copy of the same collector, and one owner is the fix. This plugin does not require it — the report and the path repair work without it — so it suggests it instead, and the first time both are installed it offers your old collect settings to it, shows you what would change, and writes nothing unless you approve. This plugin still **reports** an attachment outside its note's attachment folder; it no longer moves one.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!IMPORTANT]
>
> The `Reorganize vault` command is gone as well. It used to run a whole reshaping sequence — converting links, collecting attachments, deleting empty folders, repairing paths — and every step but the last has moved to another plugin, so all it still did was run **Fix incompatible paths**. Run that command directly; it does exactly what `Reorganize vault` did.

<!-- Separates the callouts; without it markdownlint reads them as one blockquote. -->

> [!WARNING]
>
> **Fix incompatible paths** renames files and folders across the whole vault, so it is crucial that you back up your vault before running it!

<!-- markdownlint-disable MD033 -->

<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-desktop-1.png"><img src="images/screenshots/screenshot-desktop-1.png" alt="A name your other devices reject" width="600"></a>

<details>
<summary>More screenshots</summary>

<div>
<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-desktop-2.png"><img src="images/screenshots/screenshot-desktop-2.png" alt="Repaired, with the original name kept" width="600"></a>
<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-desktop-3.png"><img src="images/screenshots/screenshot-desktop-3.png" alt="What is broken or misplaced, changing nothing" width="600"></a>
<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-mobile-1.png"><img src="images/screenshots/screenshot-mobile-1.png" alt="A name your other devices reject" width="270"></a>
<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-mobile-2.png"><img src="images/screenshots/screenshot-mobile-2.png" alt="Repaired, with the original name kept" width="270"></a>
<a href="https://github.com/dy-sh/obsidian-consistent-attachments-and-links/blob/HEAD/images/screenshots/screenshot-mobile-3.png"><img src="images/screenshots/screenshot-mobile-3.png" alt="What is broken or misplaced, changing nothing" width="270"></a>
</div>

</details>

<!-- markdownlint-enable MD033 -->

## Demo vault

**The documentation is a demo vault.** Every feature has a note that explains what it does and why you would want it, with example notes to run it against.

**[Start reading here](<./demo-vault/00 Start.md>)** — it is plain markdown, so it works on GitHub with nothing installed.

A copy of the vault ships with every release. You can access it via any of the following:

1. Running the **Consistent Attachments and Links: Open demo vault** command.
2. Downloading `consistent-attachments-and-links-demo-vault.zip` from the [Releases](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases). It unzips into a single `consistent-attachments-and-links-demo-vault-<version>` folder.
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **Audit the whole vault** and get a report of bad links, bad embed paths, bad frontmatter links and attachments sitting outside their configured attachment folder, changing nothing. [03 Check vault consistency](<./demo-vault/03 Check vault consistency.md>)
- **Keep paths valid on every platform you sync to** — find and bulk-repair the names and paths that Windows, Android, Linux, macOS or iOS would reject, without breaking a single link. [08 Keep paths valid on every platform](<./demo-vault/08 Keep paths valid on every platform.md>)
- **Every command**, and where the ones that left went. [07 Commands](<./demo-vault/07 Commands.md>)
- **Settings**, including which platforms the path repair enforces. [05 Settings](<./demo-vault/05 Settings.md>)
- **Obsidian's own settings matter too** — link format, attachment location — and the vault explains which ones to change and why. [06 Recommended Obsidian settings](<./demo-vault/06 Recommended Obsidian settings.md>)
- **Collecting attachments** moved to [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) in 5.0.0. [01 Collect attachments into the note's folder](<./demo-vault/01 Collect attachments into the note's folder.md>)

<!-- markdownlint-disable MD033 -->
## `Attachment Subfolder` setting <span id="attachment-subfolder-setting"></span>
<!-- markdownlint-enable MD033 -->

Moved to [06 Recommended Obsidian settings](<./demo-vault/06 Recommended Obsidian settings.md>).

Since [v3.0.0](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases/tag/3.0.0) this setting is no longer managed by the plugin; it follows Obsidian's built-in [`Default location for new attachments`](https://help.obsidian.md/Editing+and+formatting/Attachments#Change+default+attachment+location). This heading stays so links already pointing at it keep resolving.

## Installation

The plugin is available in [the official Community Plugins repository](https://community.obsidian.md/plugins/consistent-attachments-and-links).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/dy-sh/obsidian-consistent-attachments-and-links).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('consistent-attachments-and-links');
```

For more details, refer to the [documentation](https://mnaoumov.dev/obsidian-dev-utils/guides/debugging/).

## Changelog

All notable changes to this project will be documented in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Contributions are welcome — see [CONTRIBUTING](./CONTRIBUTING.md) to get set up.

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [dy-sh](https://github.com/dy-sh/)

Maintainer: [Michael Naumov](https://github.com/mnaoumov/)
