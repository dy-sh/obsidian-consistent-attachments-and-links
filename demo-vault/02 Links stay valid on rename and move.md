[Docs](https://github.com/mnaoumov/obsidian-consistent-attachments-and-links/)

# Links stay valid on rename and move

Obsidian already updates links when you rename a file, but this plugin extends that guarantee to the plugin's own consistent, relative-Markdown model and keeps working across moves and deletions. When **Update Links** (`shouldUpdateLinks`) is on, renaming or moving a note rewrites every incoming and outgoing link so nothing breaks.

This note has a small worked example in the [[Examples/Source note]] / [[Examples/Shared target]] pair.

## Try it

1. Open [[Examples/Source note]]. It links to [[Examples/Shared target]].
2. Rename `Shared target` (right-click -> **Rename**, or press F2) to something like `Renamed target`.
3. Return to [[Examples/Source note]] - the link now points at the renamed note and still resolves.
4. Now move `Shared target` (or its renamed version) into a new folder. The link is rewritten again to the new path.

## What to notice

- Both the link target **and** its display text can be kept in sync; keeping backlink display text current is controlled by **Change note backlinks display text** (`shouldChangeNoteBacklinksDisplayText`).
- Empty folders left behind by a move can be tidied automatically, controlled by **Empty folder behavior** (`emptyFolderBehavior`).

Next: audit the whole vault at once in [[03 Check vault consistency]].
