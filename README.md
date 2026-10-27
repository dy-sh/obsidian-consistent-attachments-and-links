# Consistent Attachments and Links

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov) [![GitHub release](https://img.shields.io/github/v/release/dy-sh/obsidian-consistent-attachments-and-links)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases) [![GitHub downloads](https://img.shields.io/github/downloads/dy-sh/obsidian-consistent-attachments-and-links/total)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases) [![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/dy-sh/obsidian-consistent-attachments-and-links)

[Obsidian](https://obsidian.md/) resolves links with a clever search that only Obsidian has, so a vault can be perfectly navigable inside it and full of dead links the moment you open a note anywhere else — in another editor, published to GitHub, or exported as a folder.

This plugin makes that visible: it reports every link whose written path does not lead to its target, repairs a broken link's path when you pick the file it meant, and repairs names a platform you sync to would reject. It never rewrites a link into a style, moves an attachment or cleans up folders: where those matter, it reports and leaves the change to you.

> [!IMPORTANT]
>
> This plugin requires [Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler), which handles renames and deletions for the whole vault since **4.0.0**. This plugin installs it in one click, which changes nothing on its own, and offers to hand your old settings across.

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

1. Running the **`Consistent Attachments and Links`: Open demo vault** command.
2. Downloading `consistent-attachments-and-links-demo-vault.zip` from the [Releases](https://github.com/dy-sh/obsidian-consistent-attachments-and-links/releases). It unzips into a single `consistent-attachments-and-links-demo-vault-<version>` folder.
3. Browsing its source in [`demo-vault/`](./demo-vault/README.md) in this repository.

## What it does

- **Check vault consistency** reports, changing nothing, bad links, embeds and frontmatter links, attachments outside their note's attachment folder, and names a platform you sync to would reject. [03 Check vault consistency](<./demo-vault/03 Check vault consistency.md>)
- **Fix broken links** offers, with its evidence, the file each broken link most likely meant, and repairs the link's path on your click. [09 Fix broken links](<./demo-vault/09 Fix broken links.md>)
- **Fix incompatible paths** repairs the names and paths that Windows, Android, Linux, macOS or iOS would reject, keeping the original name and every link. [08 Keep paths valid on every platform](<./demo-vault/08 Keep paths valid on every platform.md>)
- **Every command**, and where the ones that left went. [07 Commands](<./demo-vault/07 Commands.md>)
- **Settings**, including which platforms the path repair enforces. [05 Settings](<./demo-vault/05 Settings.md>)
- **Obsidian's own settings matter too** — link format, attachment location — and the vault explains which ones to change and why. [06 Recommended Obsidian settings](<./demo-vault/06 Recommended Obsidian settings.md>)

## Where the old features went

<!-- The span keeps #attachment-subfolder-setting resolving: plugin versions before 3.0.0 link to it. -->
<!-- markdownlint-disable MD033 -->

<span id="attachment-subfolder-setting"></span>Link conversion, link-path rewriting, attachment collecting, rename and delete handling, `Delete empty folders`, `Reorganize vault` and the `Attachment Subfolder` setting moved to other plugins or were retired: [Where the old features went](<./docs/where-the-old-features-went.md>) maps each one to the plugin that owns it now.

<!-- markdownlint-enable MD033 -->

## Similar plugins

- [`Broken Links`](https://community.obsidian.md/plugins/broken-links) — browses the links that lead nowhere, including links to missing headings and blocks, in folder, file and link views; it does not repair links or check file names.
- [`Find orphaned files and broken links`](https://community.obsidian.md/plugins/find-unlinked-files) — writes lists of orphaned files, links to notes not yet created, empty files and empty folders, and can delete or archive them; it does not check whether a written path leads to its target.
- [`Link Doctor`](https://community.obsidian.md/plugins/link-doctor) — a side panel and dashboard of broken links, headings and blocks, matched the way Obsidian matches names, plus empty notes; it never edits a note, while this plugin reports every path that does not itself lead to its target and can repair one.
- [`Vault Link Check`](https://community.obsidian.md/plugins/vault-link-check) — sorts broken links into near-misses, suggesting the note a typo or alias most likely meant, and planned notes never written; this plugin's candidates come from git history, renamed folders and aliases instead, and are applied with a click.
- [`Sync-safe file names`](https://community.obsidian.md/plugins/sync-safe-file-names) — replaces characters other devices reject with a hyphen, automatically as files are created or renamed; this plugin repairs on command, also covers length limits, reserved names and Unicode form, and keeps the original name.
- [`Safe Filename Linter`](https://community.obsidian.md/plugins/safe-filename-linter) — lints file names for invalid or troublesome characters; this plugin also checks name and path lengths per platform and checks links.
- [`File name length limit`](https://community.obsidian.md/plugins/file-name-length-limit) — warns about names other platforms reject while you type them, in the status bar and in a report that also lists names colliding by case; it does not rename, while this plugin repairs them and checks links too.
- [`Attachment Audit`](https://community.obsidian.md/plugins/attachment-audit) — finds unused, duplicate, oversized, badly named and misplaced attachments and cleans them up; this plugin only reports a misplaced attachment, judged against each note's configured attachment folder.

Last searched for similar plugins on 2026-10-26.

## Installation

The plugin is available in [the official Community Plugins repository](https://community.obsidian.md/plugins/consistent-attachments-and-links).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://community.obsidian.md) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://community.obsidian.md/plugins/obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/dy-sh/obsidian-consistent-attachments-and-links).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin (id: `consistent-attachments-and-links`) are hidden.

If you need to enable them refer to the [documentation](https://mnaoumov.dev/obsidian-lib/guides/debugging/).

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
