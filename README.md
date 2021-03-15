# Consistent attachments and links

This plugin ensures the consistency of attachments and links.


## What's the idea

The idea is to have all links between notes and attachments in strict accordance with the mardown format and support their relative paths. This is useful when you want to open a note in another program that does not know where your vault folder is, or for example you want to publish and read your notes on GitHub or another site that allows you to upload markdown files and you need compatibility.

Ideally, all attachments should be located in the note folder or its subfolders. It is not necessary, but in this case, you can easily export a note to a separate folder outside of your vault, knowing that all its attachments are with it. By deleting a note, you will know for sure that you will not delete the attachments you need or leave unnecessary garbage in your library.

If you store attachments in a folder with a note or its subfolders, the plugin will automatically move\delete attachments when you move or delete a note.

## Disclaimer

**To use this plugin, you will have to give up all the proprietary things that Obsidian uses in the link format.** 

Obsidian has a very clever file link search, but this can be a problem for you if you want your notes to be compatible with other programs. This is the main point of the plugin.

If you still want to have link compatibility with some Obsidian features, write a feature request to the [github repository](https://github.com/derwish-pro/obsidian-consistent-attachments-and-links/issues) of this plugin.


## How plugins work

When you move a note in Obsidian, the plugin checks if attachments need to be moved and links updated. If attachments are in a folder with a note or subfolders, then the plugin moves the attachments along with the note.

It does this safely, making sure not to move attachments that are referenced by other notes. If you move a note with attachments that are used in other notes, the plugin automatically creates a copy of this files and redirects the moved note to them. 

If you move a note to a folder where there are already attachments with the same names, the plugin can operate in two modes (can be selected in the settings):
1. Duplicate files will be renamed (new names are generated), and then moved to a new folder with a note.
2. It will remove the duplicate files that you move, leaving the ones that are already in the target folder. This is useful if you have unique names for all attachments. You can use this plugin which renames attachments by generating file names based on hashing of file content: [Unique attachments](https://github.com/derwish-pro/obsidian-unique-attachments) (it's great to use both of these plugins in conjunction).

When deleting a note, the plugin can delete all attachments that are no longer in use. This option can be disabled.

The plugin is also able to automatically delete empty folders that result from moving files, as well as update the text of links when renaming notes (optionally).


## How to configure 
Required Obsidian settings for the plugin to work properly:

- **"Files & Linsks > Automatically update internal links": disabled.** The plugin itself is responsible for updating the links. When Obsidian shows a dialog asking to update links, refuse.

- **"New link format": Relative path to file.** Otherwise, strict compliance of the links cannot be guaranteed.

- **"Use \[\[Wikilinks\]\]": disabled**. Wikilinks are not a markdown standard.

Recommended additional settings (not required for the plugin to work):

- **"Default location for new attachments":In subfolder under current folder**. This is not required, but this ensures that attachments are always next to your notes. The option "Same folder as current file" is also suitable.

- **"Subfolder name": "_attachments"**. Or any other.

## Caution
Please make a backup of your files before running the plugin for the first time.

## Todo

- Add hotkey "Move all attachments to notes" to reorganize the folder structure to a more consistent state in one click.

- Find broken links with a reliable algorithm by reading and checking each file.

- Option to automatically replace wikilinks with markdown links and other markdown format compliance checks.