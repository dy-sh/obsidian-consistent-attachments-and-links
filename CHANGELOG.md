# CHANGELOG

## 3.4.1

- Don't show noop messages

## 3.4.0

- Add setting `Auto Collect Attachments`

## 3.3.2

- Proper check for identical attachments

## 3.3.1

- Create folder for report

## 3.3.0

- Don't delete empty folders if setting is not set

## 3.2.0

- Add commands to run in current file
- Fix alias with leading dot

## 3.1.0

- Rewrite wiki -> markdown link converter

## 3.0.0

- Fully rewrite rename logic
- Removed **"Subfolder name"** setting. See [README.md](./README.md) for the alternative.

## 2.1.0

- Check for missing file cache

## 2.0.0

- Ensure notes are saved before collecting attachments
- Process notes in sorted order
- Simpler check for `collectAttachmentsCurrentNote`

## 1.3.0

- Fix attachments for deleted notes
- Fix removal of embedded markdown files

## 1.2.0

- Handle deleted note cache properly

## 1.1.0

- Fixed moving embedded `md` and `canvas` files
- Fixes metadata cache reliability

## 1.0.11

- FIX: wrong movement of transclusion markdown or canvas note as attachment by @jiyee in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/67
- Bugfix: diff between collect attachments and mov ing files by @jiyee in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/71

## 1.0.9

- Update README.md by @kkYrusobad in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/35
- Recognize path for invalid links as Obsidian does by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/40
- Fix typo by @JadoJodo in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/42
- Ability to use regex in ignoreFiles by @i-KishoreVarma in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/36
- Increase line number by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/49
- Remove part after # when resolve file by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/46
- Check for renamed files before removing by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/60
- Do accurate searches when validating vault consistency without hurting performance by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/51
- Improve grammar and wording by @mairas in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/61
- Get exact matching file before removal by @mnaoumov in https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/63

## 1.0.8

- Add pdf page check for non-embedded links
- Add support for pdf page sections
- Improve performance on big vaults
- Add command `Collect attachments in current note`
- Add support for `${filename}` placeholder for attachments folder setting

## 1.0.7

- small fixes

## 1.0.6

- links with sections (`#`) now supported
- `Check vault consistent` command generates report
- `ignore files and folders` setting
- many fixes

## 1.0.5

- reorganize vault
- replace wikilinks
- reorganize links

## 1.0.4

- reorganize links
- replace wilikinks

## 1.0.3

- collect files

## 1.0.2

- don't try to move file twice
- show notices, read files not from cache

## 1.0.1

- Initial implementation
