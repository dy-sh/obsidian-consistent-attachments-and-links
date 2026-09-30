# Check vault consistency

Before repairing anything, you can audit the whole vault without changing a single file. The **Check Vault Consistency** command scans every note and writes a report listing what is not yet in the plugin's consistent form:

- Bad (broken) links
- Bad (broken) embed paths
- Bad (broken) frontmatter links
- Paths and names that are invalid on a platform you sync to, covered in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>)
- Attachments that sit outside the attachment folder configured for the note that references them

## Misplaced attachments

The last section answers a different question from the others: the link works, the file is there, it is just not where your settings say attachments for that note belong. For each such reference the report names the note, the attachment it links, every other note that uses the attachment, the line, and the note's own attachment folder.

It is asked **per note**, so it is correct in a vault where different notes have different attachment folders - including when [Custom Attachment Location](https://github.com/mnaoumov/obsidian-custom-attachment-location) is installed and computing the folder from a template. Nothing has to be configured for that to work.

Each note is judged against **its own** folder. With the template `./!!files/${noteFileName}`, an image that `A.md` embeds from `!!files/B/` is an **external** attachment for `A.md`, because `A.md`'s attachments belong in `!!files/A/`. That holds even when `B.md` embeds the image too. The report shows who else uses it, and marks `B.md` as **its proper note**, the note whose own folder holds it:

```markdown
- [[A]] links to external [[image.png]] (also used by [[B]] (its proper note), [[C]], [[D]])
  - (line 1): `!!files/B/image.png`
  - This note's attachment folder is `!!files/A`
```

`B.md` itself is not reported, since the image is in its folder. The `also used by` clause is left out when no other note uses the attachment.

Two settings in [05 Settings](<./05 Settings.md>) change what counts:

- **Links to attachments outside the note's folder** - `Report` (the default) lists every such link as above. `Report unowned` lists a link only when no note that uses the attachment has it in its own folder, so the `A.md` link above is not listed. `Ignore` switches the section off.
- **Shared attachment locations** - folders any note may take attachments from, such as `_assets/common`. A link into one of them is never listed.

Two things it deliberately does **not** report:

- An attachment that is in the right folder under a name your rename template would not have produced. That is a name, not a place, and this plugin does not rename attachments.
- Anything already listed above as a bad link, embed or frontmatter link. A reference that does not resolve has no attachment to judge, so it is reported once, as the broken link it is.

Acting on the finding is a separate step and always yours to take. Since 5.0.0 moving attachments belongs to [Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location): run its **Move attachment to proper folder** on the named file, or its **Collect attachments** on the note.

## Try it

```code-button
---
caption: Check Vault Consistency
---
await require('/demoSetup.ts').checkConsistency(app);
```

Manual equivalent: run **Check Vault Consistency** from the Command Palette (`Ctrl/Cmd-P`).

1. The plugin generates a report note and opens it. Its path is configurable via the **Consistency report file** setting (`consistencyReportFile`, default `consistency-report.md`).
2. Read the report to see which notes still contain broken links, broken embed paths, paths that are invalid on a platform you sync to, or attachments sitting outside their configured folder.

## What to notice

- Nothing is modified by this command - it is a safe, read-only audit you can run any time.
- The report is the natural starting point before you run the repair in [08 Keep paths valid on every platform](<./08 Keep paths valid on every platform.md>).

## Attachment-like Markdown files (such as Excalidraw) count as attachments

Some plugins store data in files that are Markdown on disk but are really attachments. Excalidraw, for example, saves each drawing as a `.excalidraw.md` file. It is not a note you would ever read on its own - it belongs to whatever note embeds it, exactly as a `.png` does.

So any file whose extension is listed in `treatAsAttachmentExtensions` (default `.excalidraw.md`, see [05 Settings](<./05 Settings.md>)) counts as an **attachment** rather than a note in the report's **Misplaced attachments** section: a drawing sitting outside the attachment folder of the note that references it is named there, just as a misplaced image would be. An ordinary note in the same place is not, because a note is not an attachment.

The plugin never rewrites what is written inside such a file. A drawing keeps its references in its own private format, and rewriting them would stop it rendering.

### Try it with a drawing

1. Open [Source note](<./Materials/03 Check vault consistency/Source note.md>) - it references both [Shared target](<./Materials/03 Check vault consistency/Shared target.md>), an ordinary note, and [Diagram.excalidraw](<./Materials/03 Check vault consistency/Diagram.excalidraw.md>), which is Markdown on disk but an attachment as far as this setting is concerned.
2. Run **Check Vault Consistency**.
3. This vault keeps attachments in `_assets/attachments`, so the drawing is listed under **Misplaced attachments**, with that folder named as the note's attachment folder. **Shared target**, an ordinary note in the same place, is not.
4. Empty `treatAsAttachmentExtensions` in [05 Settings](<./05 Settings.md>) and check again - the drawing now reads as a note and is no longer judged, which is the difference the setting makes.
