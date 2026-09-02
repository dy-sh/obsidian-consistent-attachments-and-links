# Keep paths valid on every platform

A vault rarely lives on one machine. A note whose name is perfectly fine on the desktop you wrote it on can be impossible to sync to your phone, and you find out only when the sync fails - by which time you have no idea which file caused it.

The limits are not the same everywhere, and they are not even measured in the same unit:

| Platform | Path limit | Per-name limit |
| --- | --- | --- |
| Windows | 259 characters for a file, 247 for a folder | never binding in practice |
| Android | not binding in practice | **255 bytes** |
| Linux | not binding in practice | **255 bytes** |
| macOS | 1024 bytes | 255 bytes |
| iOS | 1024 bytes | 255 bytes |

Bytes, not characters, is the trap. A name of 100 CJK characters is 300 bytes in UTF-8: nowhere near any limit Windows has, and firmly over the one every Android device enforces. Windows has the opposite problem - a deeply nested folder blows the 259-character path budget long before any single name gets long.

Windows also rejects things the others accept: the characters `<>:"|?*`, a trailing dot or space, and the MS-DOS device names `CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9` and `LPT1`-`LPT9`.

## Try it

**Step 1 - make a note that Windows accepts and Android does not.** Typing 100 CJK characters into a file name by hand is exactly the part that hides the point, so the button does it - and turns on the Android rule so the walkthrough behaves the same wherever you are reading it:

```code-button
---
caption: Create a note with a 300-byte name
---
await require('/demoSetup.ts').createLongNameNote(app);
```

Manual equivalent: create a note with a very long non-Latin name, link to it from another note, and tick **Ensure path compatibility on Android** in the settings tab.

**Step 2 - see what the audit says about it.** The read-only report now carries a **Path compatibility** section, which names the offender, says which platform objects and why, and shows the name the repair would give it:

```code-button
---
caption: Check Vault Consistency (read-only)
---
require('/demoSetup.ts').runCommand(app, 'check-consistency');
```

**Step 3 - repair it.**

```code-button
---
caption: Fix incompatible paths
---
require('/demoSetup.ts').runCommand(app, 'fix-incompatible-paths');
```

Manual equivalent: run **Fix incompatible paths** from the Command Palette.

**Step 4.** Open `Points at the long name` - the button left it in the active tab - and look at what happened to its link. The note it points at has a new, shorter name, and the link now says so.

Start over, or put the vault back:

```code-button
---
caption: Reset the path compatibility demo
---
await require('/demoSetup.ts').resetPathCompatibilityDemo(app);
```

## What to notice

- **The name was truncated, not mangled.** The extension is kept whole - a truncated `.png` is a broken file, not a shorter one - and the cut lands on a whole character, never half of one.
- **The link still works.** The rename goes through Obsidian's own rename, so every link pointing at the file was rewritten. This is the difference between a repair and a breakage.
- **Nothing was lost.** The original name is written into the note's `aliases` and `title`, so searching for it still finds the note, and you can always read what it used to be called.
- **Only the platforms you ticked are enforced.** With just Android on, a name Windows would reject is left alone - and vice versa. Tick every platform your vault reaches, or use **Ensure path compatibility on every platform** and stop thinking about it.

## Where the original name goes

The plugin writes it into the note that describes the item:

- a Markdown note
  - its own frontmatter.
- a folder
  - its folder note, if it has one. The [Folder Notes](https://obsidian.md/plugins?id=folder-notes) plugin's own configuration decides which note that is; without it, a note named after the folder, inside it.
- an attachment
  - its sidecar note - by default `diagram.png` is described by `diagram.png.md`, which the `sidecarNoteNamePattern` setting renames.

If there is no such note, the item is repaired anyway and reported, and nothing new appears on disk. Turn on **Create a note to preserve the original name** if you would rather one were created.

## The vault root counts too

A path limit applies to the *absolute* path, so where the vault sits on disk eats into the budget before any of your folders do. The plugin uses this machine's real vault root by default, which makes the check exact here.

It cannot know where the vault sits on your *other* devices, and it does not guess: set **Maximum vault root path length** to the length of the deepest place this vault is synced to, and every check is measured against that instead. If the real root turns out to be longer than the number you gave, the plugin says so rather than quietly checking against something stricter than reality.
