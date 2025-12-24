# CHANGELOG

## 3.32.3

- chore: update libs
- fix: handle suggestions from other windows

## 3.32.2

- fix: hide unnecessary notices re #149
- chore: update libs

## 3.32.1

- feat: improve description re #144

## 3.32.0

- refactor: extract commands
- feat: reuse collect/move commands from <https://github.com/RainCat1998/obsidian-custom-attachment-location> re #146
- fix: compilation
- chore: update libs

## 3.31.16

- chore: update libs

## 3.31.15

- fix: handling include/exclude paths not ending with /

## 3.31.14

- chore: update libs

## 3.31.13

- chore: update libs
  - re #143

## 3.31.12

- chore: update libs

## 3.31.11

- chore: update libs
- chore: enable markdownlint

## 3.31.10

- fix: build
- chore: update libs

## 3.31.9

- chore: enable conventional commits

## 3.31.8

- Minor changes

## 3.31.7

- Minor changes

## 3.31.6

- Minor changes

## 3.31.5

- Minor changes

## 3.31.4

- Minor changes

## 3.31.3

- Minor changes

## 3.31.2

- Minor changes

## 3.31.1

- Minor changes

## 3.31.0

- Validate nested subpath links

## 3.30.18

- Minor changes

## 3.30.17

- Minor changes

## 3.30.16

- Minor changes

## 3.30.15

- More accurate file changes

## 3.30.14

- Minor changes

## 3.30.13

- Minor changes

## 3.30.12

- Minor changes

## 3.30.11

- Minor changes

## 3.30.10

- Minor changes

## 3.30.9

- Minor changes

## 3.30.8

- Minor changes

## 3.30.7

- More abortSignal

## 3.30.6

- Minor changes

## 3.30.5

- Minor changes

## 3.30.4

- Minor changes

## 3.30.3

- Minor changes

## 3.30.2

- Update libs (#137)

## 3.30.1

- Minor changes

## 3.30.0

- Exclude paths from attachment collecting

## 3.29.3

- Minor changes

## 3.29.2

- Minor changes

## 3.29.1

- Minor changes

## 3.29.0

- Handle frontmatter links

## 3.28.1

- Minor changes

## 3.28.0

- Hide notice when non-verbose

## 3.27.0

- EmptyAttachmentFolderBehavior

## 3.26.3

- Minor changes

## 3.26.2

- Improve performance

## 3.26.1

- Minor changes

## 3.26.0

- Treat as attachment extensions setting
  - Inspired by: <https://github.com/RainCat1998/obsidian-custom-attachment-location/issues/147>

## 3.25.4

- Minor changes

## 3.25.3

- Minor changes

## 3.25.2

- Minor changes

## 3.25.1

- New template

## 3.25.0

- Show progress bar

## 3.24.16

- Minor changes

## 3.24.15

- Minor changes

## 3.24.14

- Minor changes

## 3.24.13

- Minor changes

## 3.24.12

- Minor changes

## 3.24.11

- Minor changes

## 3.24.10

- Update template

## 3.24.9

- Lint

## 3.24.8

- Format

## 3.24.7

- Minor changes

## 3.24.6

- Refactor

## 3.24.5

- Minor changes

## 3.24.4

- Prevent unused alias
- Use copied file link first
- Fix infinite copies

## 3.24.3

- Replace console.log

## 3.24.2

- Minor changes

## 3.24.1

- Minor changes

## 3.24.0

- Fix debug logging

## 3.23.0

- Show backup warnings

## 3.22.1

- Refactor

## 3.22.0

- Add collect attachments in folder
- Exclude empty paths

## 3.21.18

- Minor changes

## 3.21.17

- Add include/exclude paths

## 3.21.16

- Minor changes

## 3.21.15

- Minor changes

## 3.21.14

- Minor changes

## 3.21.13

- Refactor to loop

## 3.21.12

- Minor changes

## 3.21.11

- Minor changes

## 3.21.10

- Avoid default exports

## 3.21.9

- Minor changes

## 3.21.8

- Minor changes

## 3.21.7

- Minor changes

## 3.21.6

- Minor changes

## 3.21.5

- Save only non-deferred views

## 3.21.4

- Minor changes

## 3.21.3

- Minor changes

## 3.21.2

- Minor changes

## 3.21.1

- Minor changes

## 3.21.0

- Minor changes

## 3.20.1

- Refactor

## 3.20.0

- Delete attachments after deleting note
- Fix attachment folder discovery
- Switch default value for `changeNoteBacklinksAlt`
- Fix race condition
- Pass `shouldUpdateFilenameAliases`
- Assign all `registerRenameDeleteHandlers` props
- Ensure `RenameDeleteHandler` is executed only once

## 3.19.0

- Extract settings from originalLink
- Always preserve displayText

## 3.18.0

- Don't remove folders with hidden files
- Pass `shouldDeleteOrphanAttachments`

## 3.17.0

- Remove to trash

## 3.16.0

- Preserve angle brackets and leading dot

## 3.15.0

- Reuse RenameDeleteHandler
- Integrate with Better Markdown Links
- Handle same case scenarios

## 3.14.0

- Don't change alias for markdown links
- Fix mobile build

## 3.13.3

- Handle removed parent folder case
- Rename attachments before changing links

## 3.13.2

- Keep link/embed format

## 3.13.1

- Fix unnecessary creation of attachment folder

## 3.13.0

- Check for race conditions
- Don't create fake files

## 3.12.0

- Add commands to convert only wiki embeds

## 3.11.0

- Fix alias checks
- Resolve links better
- Generate links instead of constructing them manually
- Proper check overlapping change

## 3.10.0

- Stop long running operations on unload

## 3.9.0

- Fix root folder corner cases

## 3.8.0

- Fix moving attachments
- Avoid unnecessary temp file/folder creations

## 3.7.0

- Don't create file/folder in getAttachmentFilePath
- When attachment folder is shared, move only uniquely used attachments

## 3.6.0

- Fix links in report file

## 3.5.1

- Fix more race conditions

## 3.5.0

- Fix race conditions
- Update README about `Attachment Subfolder` setting

## 3.4.2

- Show warning on first load

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

- FIX: wrong movement of transclusion markdown or canvas note as attachment by @jiyee in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/67>
- Bugfix: diff between collect attachments and mov ing files by @jiyee in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/71>

## 1.0.9

- Update README.md by @kkYrusobad in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/35>
- Recognize path for invalid links as Obsidian does by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/40>
- Fix typo by @JadoJodo in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/42>
- Ability to use regex in ignoreFiles by @i-KishoreVarma in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/36>
- Increase line number by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/49>
- Remove part after # when resolve file by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/46>
- Check for renamed files before removing by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/60>
- Do accurate searches when validating vault consistency without hurting performance by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/51>
- Improve grammar and wording by @mairas in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/61>
- Get exact matching file before removal by @mnaoumov in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/63>

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
