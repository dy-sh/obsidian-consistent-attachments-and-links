# Consistent attachments and links

This plugin provides attachment and link consistency.

## What's the idea

The idea is to ensure that notes always have the correct relative path to attachments and to each other.
This is useful when you want to open a note in another program that does not know where your vault folder is. Or, post notes on Github, for example.

Ideally, all attachments should be located in the note folder or its subfolders. In this case, you can easily export a note to a separate folder outside of your vault, knowing that all its attachments are with it.

By deleting a note, you know for sure that you will not delete the attachments you still need and will not leave unnecessary garbage in your library.

## How plugins work

When you move a note in Obsidian, this plugin moves note attachments and update links automatically.

It does this safely, making sure not to move attachments that are referenced by other notes.
If you move a note with attachments that are used in other notes, the plugin automatically creates a copy of this files and redirects the moved note to them. 

If you move a note to a folder where there are already attachments with the same names, the plugin can operate in two modes (can be selected in the settings):
1. Duplicate files will be renamed (new names are generated), and then moved to a new folder with a note. This is useful if your attachment files do not have unique names and you want each note to link only to its own files. 
2. It will remove the duplicate files that you move, leaving the ones that are already in the target folder. In this case, the links will be updated and, as a result, they will refer to the existing files. If there was a note in the target folder that referred to these files, then after moving, all notes will use the same files. This is useful if you have unique names for all attachments.

When deleting a note, the plugin can delete all attachments that are no longer in use. This option can be disabled.

The plugin is also able to automatically delete empty folders that result from moving files, as well as update the text of links when renaming notes (optionally).


## How to configure 
Recommended Obsidian settings for the plugin to work properly:

- **"Files & Linsks > Automatically update internal links": disabled.** The plugin itself is responsible for updating the links. When Obsidian shows a dialog asking to update links, refuse.

- **"New link format": Relative path to file.** Otherwise, strict compliance of the links cannot be guaranteed.

- **"Use \[\[Wikilinks\]\]": disabled**. At the moment, the plugin does not work with wikilinks. Perhaps it will be in an update later.

- **"Default location for new attachments":In subfolder under current folder**. This is not required, but this ensures that attachments are always next to your notes. The option "Same folder as current file" is also suitable.

- **"Subfolder name": "_attachments"**. Or any other.

## Caution
Please make a backup of your files before running the plugin for the first time.

## Todo

- Add hotkey "Move all attachments to notes", to reorganize the folder structure to a more consistent state in one click.

- A separate plugin that renames attachments by generating names with a hash function of their contents. In the settings, you can set the type of attachments that will be processed. As a result, the same file with an image in different folders will have the same name if it is the same in content. This will improve consistency when moving notes with attachments.

- Wikilinks support

- Find broken links with a reliable algorithm by reading and checking each file.

- Option to automatically replace wikilinks with markdown links and other markdown format compliance checks.