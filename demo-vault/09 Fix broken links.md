# Fix broken links

A folder renamed in a file manager, a note moved by a sync tool, a letter's case changed on another machine: Obsidian was not watching, so nothing rewrote the links, and every link into what moved now leads nowhere.

**Check Vault Consistency** lists those links. **Fix broken links** goes one step further: for each one it looks for the file the link most likely meant, shows why it thinks so, and repairs the link when you click.

## How it finds the file

A broken link alone cannot say where its target went - a link to `Trips/Lisbon/Itinerary.md` says nothing about `Lisbon` having become `Lisbon 2024`. So every suggestion comes with evidence from outside the link:

- **Git history**: when the vault is in a git repository, the rename is recorded there. The strongest evidence, read on desktop only.
- **Only the letter case differs**.
- **Aliases or title**: the note's `aliases` or `title` still hold the old name.
- **A renamed folder**: the folder is gone, and a sibling folder holds every missing file that was under it.
- **The same name elsewhere**: a file with the same name, sharing the longest run of parent folders.

When exactly one file is suggested, **Fix** repairs the link. When several are, each gets a **Use this** button and nothing is chosen for you.

## Try it

**Step 1 - break some links the way a file manager would.** The button creates `Trips/Lisbon/` with two notes and a travel log linking into it, then renames the folder to `Lisbon 2024` without updating any link:

```code-button
---
caption: Rename a folder behind Obsidian's back
---
await require('/demoSetup.ts').createRenamedFolderDemo(app);
```

**Step 2 - open the view.**

```code-button
---
caption: Fix broken links
---
await require('/demoSetup.ts').openFixBrokenLinks(app);
```

Manual equivalent: run **Fix broken links** from the Command Palette.

The two links into the renamed folder are grouped under one heading, `"…/Trips/Lisbon" is now "…/Trips/Lisbon 2024"`, with the evidence for each. **Fix all like this** repairs both at once. Open **Travel log** in `Materials/09 Fix broken links` afterwards: only the paths changed - the markdown link is still a markdown link, and the wikilink kept its `What to pack` alias.

The link to `Visa.pdf` is listed under **No candidate found**: nothing in the vault suggests where it went, so the view offers only **Open source** and **Ignore**.

**Step 3 - clean up.**

```code-button
---
caption: Reset the demo
---
await require('/demoSetup.ts').resetBrokenLinksDemo(app);
```

## What it never does

- It never fixes a link without a click, and never picks one of several candidates.
- It changes only the path written in a link: the link's style, its heading or block, its alias and its encoding stay as they were.
- **Ignore** hides a link until the next check. To leave a folder out for good, use **Exclude paths** in [05 Settings](<./05 Settings.md>).

## Settings

- **Folder note file names**: if your folder notes all share a name such as `index.md`, list it, so a moved folder note is recognized by its folder's name rather than by a name every folder note shares.
- **Use git history to find renamed targets**: on by default; turn it off to skip the `git log` the check runs on desktop.
