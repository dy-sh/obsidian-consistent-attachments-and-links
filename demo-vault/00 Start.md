# Start here

Welcome to the [Consistent Attachments and Links](https://github.com/mnaoumov/obsidian-consistent-attachments-and-links/) demo vault. This plugin keeps your attachments and links consistent as you reorganize a vault: when you move, rename, or delete a note, it moves the note's attachments, updates every link, and can clean up the folders left behind. It also ships commands to audit the whole vault and convert links into a portable, relative, Markdown form.

> [!WARNING] Back up real vaults first
>
> Because the plugin can move and delete files across your vault, always back up a real vault before running its bulk commands. This throwaway demo vault is safe to experiment in.

## Your first two minutes

1. Open [Source note](<./Materials/02 Links stay valid on rename and move/Source note.md>). It links to
   **Shared target**, a note sitting beside it.
2. Rename **Shared target** to anything else — right-click it in the File Explorer, `Rename`.
3. Go back to **Source note**. The link now points at the new name and still resolves. Obsidian updates
   links it wrote itself; this plugin is what keeps the rest consistent, including attachments and the
   link styles Obsidian leaves alone.
4. Now read [02 Links stay valid on rename and move](<./02 Links stay valid on rename and move.md>) for
   what just happened and which settings control it.

Then work down the list below.

## Features

- [01 Attachments move with their note](<./01 Attachments move with their note.md>)
- [02 Links stay valid on rename and move](<./02 Links stay valid on rename and move.md>)
- [03 Check vault consistency](<./03 Check vault consistency.md>)
- [04 Reorganize and convert links](<./04 Reorganize and convert links.md>)
- [05 Settings](<./05 Settings.md>)
- [06 Recommended Obsidian settings](<./06 Recommended Obsidian settings.md>)
- [07 Commands](<./07 Commands.md>)

## Materials

`Materials/` holds the notes and attachments the walkthroughs operate on, one folder per note that
needs them — `Materials/02 Links stay valid on rename and move/` belongs to
[02 Links stay valid on rename and move](<./02 Links stay valid on rename and move.md>). You never have
to open it directly; each note links to what it needs. Since this plugin's whole subject is moving and
renaming things, expect the contents to change as you follow the walkthroughs — that is the point.
