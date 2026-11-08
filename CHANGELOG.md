# CHANGELOG

## 5.4.0

This release has 1 new feature, 1 fix and 3 documentation changes. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **consistency-check:** report HTML tags Obsidian does not know or sanitizes

### Fixed

- guard desktop `git` dependencies for mobile scanners

### Documentation

- make issue attachments optional and strongly encouraged
- link to the Obsidian resources page
- **readme:** point bug reports at the Report a bug command

## 5.3.0

This release has 5 new features, 3 fixes, 2 improvements and 4 documentation changes. 10 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **path-compatibility:** keep names unchanged in configured paths
- add a Report a bug command
- **bulk-operations:** commit each fix run to `git`, so one revert undoes it
- **path-compatibility:** configurable forbidden character replacement, keep an existing title, optional alias
- fix broken links interactively, showing the evidence for each candidate

### Fixed

- **path-compatibility:** judge the Android profile by its own forbidden characters
- **consistency-check:** cap each report section at 1,000 entries, so the report stays openable
- **path-compatibility:** blame Obsidian for link characters, and name the evidence

### Improved

- **consistency-check:** ask the misplaced-attachment check folder-only, and pin it at vault scale
- **consistency-check:** stop Check vault consistency judging its own report and asking twice per reference

### Documentation

- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- move the README's migration table into its own note
- list similar plugins in the README

## 5.2.3

This release has 1 fix.

### Fixed

- **dependency:** require `Advanced Rename and Delete Handler` 3.0.1, the first on `obsidian-lib` 6

## 5.2.2

This release has 1 fix and 6 documentation changes. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- drop the plugin name from notice text

### Documentation

- name `obsidian-lib` where comments said dev-utils
- point leftover `obsidian-dev-utils` mentions at the packages that hold them now
- shorten the debugging section
- **changelog:** escape the issue-title tags so `markdownlint` and `cspell` pass
- **changelog:** name the issue each released entry resolved
- **readme:** lead the Debugging section with `Advanced Debug Mode`

## 5.2.1

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 5.2.0

**Migration:** include, exclude and shared-attachment path entries now match case-insensitively in every form. An unescaped `*`, `?` or `[` makes an entry a glob (`*.pdf`, `Attachments/**/*.png`, `tmp*/`), so a plain path that contains one of those characters literally must escape it (`Notes \[old\]`). An entry shaped `/pattern/flags` is a regular expression whose flags are honoured, and a folder-only glob (ending in `/`) also matches the folder itself when `Fix incompatible paths` checks a folder's name. A folder carried over from the pre-4.0 `ignoreFolders` setting is escaped, so it stays a literal path.

- feat(settings): adopt `obsidian-lib` 5.0.0 path settings
- feat(paths): normalize decomposed Unicode names to NFC
- fix(ui): mark plugin names as code in the dependency and suggestion reasons
- docs: mark plugin names as code
- docs(demo-vault): add buttons to the drawing walkthrough
- build(demo-vault): require `CodeScript Toolkit` 13.8.0 for the `obsidian-lib` demo script
- test(report): pin heading links whose colon Obsidian dropped (#121)
- ci: attest release assets through the toolkit's reusable workflow
- chore(github): point questions to Discussions from the new-issue page

## 5.1.1

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **ui:** mark plugin names as code in the backup warning, markdown and comments

## 5.1.0

**The misplaced-attachments report now lists a note's links to external attachments, and this changes what 5.0.2 did.**

A note that links an attachment outside its own attachment folder is reported even when another note that uses the attachment has it in its own folder. With `./!!files/${noteFileName}`, `A.md` embedding `!!files/B/image.png` is reported for A, even when `B.md` embeds it too. Each line names every other note that uses the attachment and marks the note whose folder holds it:

`[[A]] links to external [[image.png]] (also used by [[B]] (its proper note), [[C]], [[D]])`

5.0.2 reported nothing in that case. To keep that behavior, set **Links to attachments outside the note's folder** to **Report unowned**.

New settings:

- **Links to attachments outside the note's folder**: **Report** (default) lists every such link. **Report unowned** lists it only when no note that uses the attachment has it in its own folder. **Ignore** switches the section off.
- **Shared attachment locations**: folders, or `/regular expressions/`, that any note may take attachments from, such as `_assets/common`. A link into one of them is never reported.

- feat(report): report links to external attachments, with a mode and shared locations

## 5.0.2

This release has 1 fix.

### Fixed

- **report:** stop reporting a shared attachment filed in one of its notes' folders

## 5.0.1

This release has 3 documentation changes.

### Documentation

- **readme:** make the moved-features intro release-agnostic
- **readme:** fold the Attachment Subfolder note into the moved-features table
- merge leading the README with what the plugin still does

## 5.0.0

**Breaking: this plugin no longer collects attachments.**

[Custom Attachment Location](https://community.obsidian.md/plugins/obsidian-custom-attachment-location) now owns it: **Collect attachments** for a note, a folder or the whole vault, **Move attachment to proper folder**, and collecting as you edit. Install it to keep those commands. This plugin does not require it. The consistency report and **Fix incompatible paths** work without it, and the report still names every attachment sitting outside its note's attachment folder.

Why the change: this plugin carried a copy of that plugin's collector, kept deliberately identical, and a user with both installed got two sets of collect commands. One owner is the fix, as it was for renames and deletions in 4.0.0.

**Your collect settings are not lost.** The first time both plugins are installed, this one offers that plugin your old collect settings: what to do with an attachment several notes share, the paths collecting skips, the attachment unit folders, and whether collecting ran as you edited. It shows you what would change and writes nothing unless you approve. Cancelling leaves the offer pending, so it comes back. **Add commands to file menu** is not carried over: that plugin always shows its collect and move commands in the file menu.

The settings that **stay here** (the include and exclude paths, and the treat-as-attachment extensions) are still read by the report and the path repair.

**Reorganize vault is gone.** Every step it ran but one has left this plugin (link rewriting in 4.0.1, empty-folder cleanup to `Advanced Rename and Delete Handler` in 4.1.0, and collecting now), so it had become another name for **Fix incompatible paths**. Run that command instead.

- chore: merge dropping the local desktop caret blur
- chore: merge the desktop capture caret fix
- chore: merge the `obsidian-integration-testing` 17 float
- chore: merge the Reorganize vault retirement
- feat!: hand attachment collecting to `Custom Attachment Location`
- fix(demo-vault): merge the awaited consistency-check buttons

## 4.1.0

**[Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) is now required.** This plugin used to suggest it; it now waits for it. Until it is installed, this plugin shows a notice that installs it in one click and finishes loading the moment it arrives. Its defaults change nothing in your vault until you turn renames or deletions on.

**Delete empty folders has moved to `Advanced Rename and Delete Handler`**, under the same name and the same command id, so your hotkey and your command-palette habit keep working.

The consistency report gains a **Misplaced attachments** section, naming every attachment that sits outside the attachment folder configured for the note that uses it.

Fixed:

- **Move attachment to proper folder** did nothing for an attachment used by exactly one note (#160).
- The offer to hand your old rename and delete settings to `Advanced Rename and Delete Handler` came back on every start, even after you had answered it (#159).

- fix(settings): merge the one-shot rename/delete handover (re #159 - \[BUG\] Migration popup triggers every startup, causing competing renaming between plugins)
- chore(deps): merge `obsidian-test-mocks` ^7.0.0
- style(comments): stop capitalizing the middle of a wrapped comment
- fix(test): merge the headless demo-vault toolkit install
- fix(deps): restore the lockfile's missing resolved and integrity fields
- chore: merge the sharp no-named-as-default silencing
- chore: merge the no-soft-break-in-paragraph rollout
- docs: record that the rename is the repair's earliest effect, not its last
- test: settle the path-compatibility suite on the write it asserts, not the rename that precedes it
- feat(report): name attachments sitting outside their configured folder
- test: settle the source-note-skip suite on a declared walk order, not a name coincidence
- fix: move an attachment used by exactly one note to its proper folder (re #160)
- test: size the three remaining over-cap wait closures by call site
- refactor(plugin): scope onloadImpl commands through the library, not a local disposal
- test: settle the excalidraw collecting suite on a trailing image, not the leading one
- chore(spellcheck): teach `cspell` the word lintable
- feat!: hand Delete empty folders to `Advanced Rename and Delete Handler`
- fix(deps): float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- chore(deps): drop four dead overrides and justify the one that is not
- chore(deps): drop the dead markdown-it override
- chore(deps): drop the dead js-yaml override
- docs: replace the private rule-id citations with what they assert
- test: run the mobile file-drawer retry from Node, so its own diagnostic can fire
- docs: name the library and the sibling plugins so a reader can resolve them
- docs: replace the private tracker references with what they pointed at
- test: bring the in-closure wait ceilings under the transport's per-eval cap
- feat!: require `Advanced Rename and Delete Handler` instead of suggesting it

## 4.0.1

This release has 3 new features, 1 fix and 4 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- strip the four convert-to-relative commands
- hand wikilink conversion to `Better Markdown Links`
- **path-compatibility:** repair names and paths that other platforms reject

### Fixed

- **attachment-collector:** honour treat-as-attachment in the note walk

### Documentation

- say where the debug command is run
- name the unversioned demo-vault asset and the folder it unzips into
- **agents:** settle the plugin's scope line and mint the removals it implies
- describe what the plugin does, and point every link at the real repo

## 4.0.0

**Breaking: this plugin no longer handles renames and deletions.**

[Advanced Rename and Delete Handler](https://obsidian.md/plugins?id=advanced-rename-and-delete-handler) now owns that for the whole vault. Install it to keep attachments traveling with their note and links rewritten when you move, rename or delete one. Declining leaves every other feature here working — collecting attachments, the consistency audit, and the link-conversion commands are unaffected.

Why the change: five plugins each bundled their own copy of the same handler. Two handlers acting on one rename corrupt links and move attachments twice, and which copy actually ran depended on Obsidian's load order — so what your vault did depended on which versions you happened to have installed. One owner, for the whole vault, is the fix.

**Your existing settings are not lost.** The first time both plugins are installed, this one offers your old rename and delete settings to the new one, shows you exactly what would change, and writes nothing unless you approve. Cancelling leaves the offer pending, so it comes back.

- feat!: hand rename and delete handling to `Advanced Rename and Delete Handler`
- feat: suggest `Advanced Rename and Delete Handler`, through a notice and a settings-tab banner
- feat: offer the 3.x rename and delete settings to their new owner, once
- test(integration): guard the settings hand-over against a real data.json
- docs: rewrite the demo vault and README around what this plugin still does
- chore: update libs

The settings that moved: `shouldUpdateLinks`, `shouldMoveAttachmentsWithNote`, `shouldDeleteAttachmentsWithNote`, `shouldDeleteExistingFilesWhenMovingNote`, `shouldChangeNoteBacklinksDisplayText` and `emptyFolderBehavior`. The path and treat-as-attachment settings stay here — other features read them — and are offered to the new plugin as a starting point rather than handed over.

## 3.35.5

This release has 3 fixes and 1 documentation change. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install
- **i18n:** point the custom-token notice at the live `Custom Attachment Location` repo

### Documentation

- point plugin-directory links at community.obsidian.md

## 3.35.4

This release has 1 new feature, 1 fix and 6 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- **attachment-collector:** treat designated folders as one attachment

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **demo-vault:** unwrap the notes so Obsidian stops rendering a break per line
- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** document the attachmentUnitFolderPaths setting
- record the extract-zip security override
- **demo-vault:** give the demo vault its code buttons
- add store screenshots and surface them in the README

## 3.35.3

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 3.35.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.35.1

This release has maintenance changes only. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.35.0

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.34.2

This release has 1 documentation change. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- fix the demo vault download instructions

## 3.34.1

This release has 1 fix.

### Fixed

- stop endless auto-collect rename loop for already-proper attachments (re #152)

## 3.34.0

This release has 2 fixes and 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- \[BUG\] `Excalidraw` images not rendering after updating links (#151)
- \[BUG\] duplication of the context menu command (#153)

### Documentation

- demonstrate context-menu toggle and `Excalidraw` link-skip in the demo vault

## 3.33.16

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- \[BUG\] if disable "update link" option, the move (#154)

## 3.33.15

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.14

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 3.33.13

This release has 5 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- **demo-vault:** create the `Consistent Attachments and Links` demo vault
- update
- migrate to AGENTS.md

## 3.33.12

This release has maintenance changes only. 8 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.33.11

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.10

This release has maintenance changes only. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.33.9

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.8

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.33.7

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.33.6

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.3

This release has 1 new feature.

### New

- safer trashing

## 3.33.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.1

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.33.0

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.32.5

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- rename emptyFolderBehavior

## 3.32.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.32.3

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- handle suggestions from other windows

## 3.32.2

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- hide unnecessary notices re #149

## 3.32.1

This release has 1 new feature.

### New

- improve description re #144

## 3.32.0

This release has 1 new feature and 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- reuse collect/move commands from <https://github.com/RainCat1998/obsidian-custom-attachment-location> re #146

### Fixed

- compilation

## 3.31.16

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.31.15

This release has 1 fix.

### Fixed

- handling include/exclude paths not ending with /

## 3.31.14

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.31.13

- chore: update libs
  - re #143

## 3.31.12

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.31.11

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 3.31.10

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- build

## 3.31.9

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 3.31.8

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.7

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.6

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.5

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.4

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.2

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.31.0

This release has 1 other change.

### Other changes

- Validate nested subpath links

## 3.30.18

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.17

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.16

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.15

This release has 1 other change.

### Other changes

- More accurate file changes

## 3.30.14

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.13

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.12

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.11

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.10

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.9

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.8

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.7

This release has 1 other change.

### Other changes

- More abortSignal

## 3.30.6

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.5

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.4

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.2

This release has 1 other change.

### Other changes

- Update libs (#137)

## 3.30.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.30.0

This release has 1 other change.

### Other changes

- Exclude paths from attachment collecting

## 3.29.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.29.2

This release has 1 other change.

### Other changes

- Minor changes

## 3.29.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.29.0

This release has 1 other change.

### Other changes

- Handle frontmatter links

## 3.28.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.28.0

This release has 1 other change.

### Other changes

- Hide notice when non-verbose

## 3.27.0

This release has 1 other change.

### Other changes

- EmptyAttachmentFolderBehavior

## 3.26.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.26.2

This release has 1 other change.

### Other changes

- Improve performance

## 3.26.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.26.0

- Treat as attachment extensions setting
  - Inspired by: <https://github.com/RainCat1998/obsidian-custom-attachment-location/issues/147>

## 3.25.4

This release has 1 other change.

### Other changes

- Minor changes

## 3.25.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.25.2

This release has 1 other change.

### Other changes

- Minor changes

## 3.25.1

This release has 1 other change.

### Other changes

- New template

## 3.25.0

This release has 1 other change.

### Other changes

- Show progress bar

## 3.24.16

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.15

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.14

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.13

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.12

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.11

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.10

This release has 1 other change.

### Other changes

- Update template

## 3.24.9

This release has 1 other change.

### Other changes

- Lint

## 3.24.8

This release has 1 other change.

### Other changes

- Format

## 3.24.7

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.6

This release has 1 other change.

### Other changes

- Refactor

## 3.24.5

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.4

This release has 3 other changes.

### Other changes

- Prevent unused alias
- Use copied file link first
- Fix infinite copies

## 3.24.3

This release has 1 other change.

### Other changes

- Replace console.log

## 3.24.2

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.24.0

This release has 1 other change.

### Other changes

- Fix debug logging

## 3.23.0

This release has 1 other change.

### Other changes

- Show backup warnings

## 3.22.1

This release has 1 other change.

### Other changes

- Refactor

## 3.22.0

This release has 2 other changes.

### Other changes

- Add collect attachments in folder
- Exclude empty paths

## 3.21.18

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.17

This release has 1 other change.

### Other changes

- Add include/exclude paths

## 3.21.16

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.15

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.14

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.13

This release has 1 other change.

### Other changes

- Refactor to loop

## 3.21.12

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.11

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.10

This release has 1 other change.

### Other changes

- Avoid default exports

## 3.21.9

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.8

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.7

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.6

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.5

This release has 1 other change.

### Other changes

- Save only non-deferred views

## 3.21.4

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.3

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.2

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.1

This release has 1 other change.

### Other changes

- Minor changes

## 3.21.0

This release has 1 other change.

### Other changes

- Minor changes

## 3.20.1

This release has 1 other change.

### Other changes

- Refactor

## 3.20.0

This release has 7 other changes.

### Other changes

- Delete attachments after deleting note
- Fix attachment folder discovery
- Switch default value for `changeNoteBacklinksAlt`
- Fix race condition
- Pass shouldUpdateFilenameAliases
- Assign all registerRenameDeleteHandlers props
- Ensure RenameDeleteHandler is executed only once

## 3.19.0

This release has 2 other changes.

### Other changes

- Extract settings from originalLink
- Always preserve displayText

## 3.18.0

This release has 2 other changes.

### Other changes

- Don't remove folders with hidden files
- Pass shouldDeleteOrphanAttachments

## 3.17.0

This release has 1 other change.

### Other changes

- Remove to trash

## 3.16.0

This release has 1 other change.

### Other changes

- Preserve angle brackets and leading dot

## 3.15.0

This release has 3 other changes.

### Other changes

- Reuse RenameDeleteHandler
- Integrate with `Better Markdown Links`
- Handle same case scenarios

## 3.14.0

This release has 2 other changes.

### Other changes

- Don't change alias for markdown links
- Fix mobile build

## 3.13.3

This release has 2 other changes.

### Other changes

- Handle removed parent folder case
- Rename attachments before changing links

## 3.13.2

This release has 1 other change.

### Other changes

- Keep link/embed format

## 3.13.1

This release has 1 other change.

### Other changes

- Fix unnecessary creation of attachment folder

## 3.13.0

This release has 2 other changes.

### Other changes

- Check for race conditions
- Don't create fake files

## 3.12.0

This release has 1 other change.

### Other changes

- Add commands to convert only wiki embeds

## 3.11.0

This release has 4 other changes.

### Other changes

- Fix alias checks
- Resolve links better
- Generate links instead of constructing them manually
- Proper check overlapping change

## 3.10.0

This release has 1 other change.

### Other changes

- Stop long running operations on unload

## 3.9.0

This release has 1 other change.

### Other changes

- Fix root folder corner cases

## 3.8.0

This release has 2 other changes.

### Other changes

- Fix moving attachments
- Avoid unnecessary temp file/folder creations

## 3.7.0

This release has 2 other changes.

### Other changes

- Don't create file/folder  in getAttachmentFilePath
- When attachment folder is shared, move only uniquely used attachments

## 3.6.0

This release has 1 other change.

### Other changes

- Fix links in report file

## 3.5.1

This release has 1 other change.

### Other changes

- Fix more race conditions

## 3.5.0

This release has 2 other changes.

### Other changes

- Fix race conditions
- Update README about `Attachment Subfolder` setting

## 3.4.2

This release has 1 other change.

### Other changes

- Show warning on first load

## 3.4.1

This release has 1 other change.

### Other changes

- Don't show noop messages

## 3.4.0

This release has 1 other change.

### Other changes

- Add setting `Auto Collect Attachments`

## 3.3.2

This release has 1 other change.

### Other changes

- Proper check for identical attachments

## 3.3.1

This release has 1 other change.

### Other changes

- Create folder for report

## 3.3.0

This release has 1 other change.

### Other changes

- Don't delete empty folders if setting is not set

## 3.2.0

This release has 2 other changes.

### Other changes

- Add commands to run in current file
- Fix alias with leading dot

## 3.1.0

This release has 1 other change.

### Other changes

- Rewrite wiki -> markdown link converter

## 3.0.0

This release has 2 other changes.

### Other changes

- Fully rewrite rename logic
- Removed **"Subfolder name"** setting. See [README.md](./README.md) for the alternative.

## 2.1.0

This release has 1 other change.

### Other changes

- Check for missing file cache

## 2.0.0

This release has 3 other changes.

### Other changes

- Ensure notes are saved before collecting attachments
- Process notes in sorted order
- Simpler check for collectAttachmentsCurrentNote

## 1.3.0

This release has 2 other changes.

### Other changes

- Fix attachments for deleted notes
- Fix removal of embedded markdown files

## 1.2.0

This release has 1 other change.

### Other changes

- Handle deleted note cache properly

## 1.1.0

This release has 2 other changes.

### Other changes

- Fixed moving embedded `md` and `canvas` files
- Fixes metadata cache reliability

## 1.0.11

This release has 1 fix and 1 other change.

### Fixed

- wrong movement of transclusion markdown or canvas note as attachment by @jiyee in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/67>

### Other changes

- diff between collect attachments and mov ing files by @jiyee in <https://github.com/dy-sh/obsidian-consistent-attachments-and-links/pull/71>

## 1.0.9

This release has 10 other changes.

### Other changes

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

This release has 5 other changes.

### Other changes

- Add pdf page check for non-embedded links
- Add support for pdf page sections
- Improve performance on big vaults
- Add command `Collect attachments in current note`
- Add support for ${filename} placeholder for attachments folder setting

## 1.0.7

This release has 1 other change.

### Other changes

- small fixes

## 1.0.6

This release has 4 other changes.

### Other changes

- links with sections (`#`) now supported
- `Check vault consistent` command generates report
- `ignore files and folders` setting
- many fixes

## 1.0.5

This release has 3 other changes.

### Other changes

- reorganize vault
- replace wikilinks
- reorganize links

## 1.0.4

This release has 2 other changes.

### Other changes

- reorganize links
- replace wilikinks

## 1.0.3

This release has 1 other change.

### Other changes

- collect files

## 1.0.2

This release has 2 other changes.

### Other changes

- don't try to move file twice
- show notices, read files not from cache

## 1.0.1

This release has 1 other change.

### Other changes

- Initial implementation
